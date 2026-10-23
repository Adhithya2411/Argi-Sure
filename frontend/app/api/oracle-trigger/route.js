import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const LAT_OFFSET = 900000000;   // 90 * 10^7
const LON_OFFSET = 1800000000;  // 180 * 10^7
const SCALE_FACTOR = 10000000;  // 10^7

const AGRI_ORACLE_ABI = [
  "function devTriggerDisaster(uint256 _minLat, uint256 _maxLat, uint256 _minLon, uint256 _maxLon) external"
];

const ESCROW_ABI = [
  "function nextDisasterId() external view returns (uint256)",
  "function disasters(uint256) external view returns (uint256 minLat, uint256 maxLat, uint256 minLon, uint256 maxLon, bool isActive)"
];

// Helper to look up nearest real earthquake in local datasets
function findNearbyDatabaseEvent(lat, lon) {
  try {
    const dir = path.join(process.cwd(), '../datasets');
    if (!fs.existsSync(dir)) return null;
    const file = fs.readdirSync(dir).filter(f => /^USGS_.*\.json$/.test(f)).sort().pop();
    if (!file) return null;
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

    for (const ev of data) {
      const p = ev.oracle_payload;
      const cLat = ((p.minLat + p.maxLat) / 2) / SCALE_FACTOR;
      const cLon = ((p.minLon + p.maxLon) / 2) / SCALE_FACTOR;
      if (Math.abs(cLat - lat) <= 1.0 && Math.abs(cLon - lon) <= 1.0) {
        return {
          location: ev.location,
          minLat: Number((p.minLat / SCALE_FACTOR).toFixed(4)),
          maxLat: Number((p.maxLat / SCALE_FACTOR).toFixed(4)),
          minLon: Number((p.minLon / SCALE_FACTOR).toFixed(4)),
          maxLon: Number((p.maxLon / SCALE_FACTOR).toFixed(4)),
        };
      }
    }
  } catch (_) {}
  return null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    let { minLat, maxLat, minLon, maxLon, eventName, lat, lon } = body;

    // If point coordinates are provided, compute or match the disaster bounding box
    if (lat !== undefined && lon !== undefined) {
      lat = parseFloat(lat);
      lon = parseFloat(lon);

      // Check database first
      const dbMatch = findNearbyDatabaseEvent(lat, lon);
      if (dbMatch) {
        minLat = dbMatch.minLat;
        maxLat = dbMatch.maxLat;
        minLon = dbMatch.minLon;
        maxLon = dbMatch.maxLon;
        eventName = `USGS Verified Event: ${dbMatch.location}`;
      } else {
        // Standard 0.5-deg macro perimeter around the farm coordinates
        const radius = 0.5;
        minLat = Number((lat - radius).toFixed(4));
        maxLat = Number((lat + radius).toFixed(4));
        minLon = Number((lon - radius).toFixed(4));
        maxLon = Number((lon + radius).toFixed(4));
        eventName = `Regional Seismic Anomaly (${lat >= 0 ? lat.toFixed(2) + '°N' : Math.abs(lat).toFixed(2) + '°S'}, ${lon >= 0 ? lon.toFixed(2) + '°E' : Math.abs(lon).toFixed(2) + '°W'})`;
      }
    }

    if (minLat === undefined || maxLat === undefined || minLon === undefined || maxLon === undefined) {
      return NextResponse.json({ error: "Missing required coordinates (provide lat/lon or minLat/maxLat/minLon/maxLon)" }, { status: 400 });
    }

    const rpcUrl = process.env.SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
    const privateKey = process.env.PRIVATE_KEY;
    const oracleAddress = process.env.NEXT_PUBLIC_ORACLE_ADDRESS || '0x40Ed7b246A48b5C68792dE5a6ee0eb46D658179D';
    const escrowAddress = process.env.NEXT_PUBLIC_ESCROW_ADDRESS || '0xeC99C485edb9EABb9D7C1Ad5d77882c7d066Be39';

    if (!privateKey) {
      return NextResponse.json({ error: "PRIVATE_KEY is not configured in server environment." }, { status: 500 });
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Convert GPS floats into on-chain offset coordinates
    const uMinLat = Math.round(Number(minLat) * SCALE_FACTOR) + LAT_OFFSET;
    const uMaxLat = Math.round(Number(maxLat) * SCALE_FACTOR) + LAT_OFFSET;
    const uMinLon = Math.round(Number(minLon) * SCALE_FACTOR) + LON_OFFSET;
    const uMaxLon = Math.round(Number(maxLon) * SCALE_FACTOR) + LON_OFFSET;

    // Check if an existing active disaster on-chain already covers this bounding box
    try {
      const escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, provider);
      const nextId = await escrow.nextDisasterId();
      for (let i = Number(nextId) - 1; i >= 1; i--) {
        const d = await escrow.disasters(i);
        if (d.isActive) {
          const dMinLat = (Number(d.minLat) - LAT_OFFSET) / SCALE_FACTOR;
          const dMaxLat = (Number(d.maxLat) - LAT_OFFSET) / SCALE_FACTOR;
          const dMinLon = (Number(d.minLon) - LON_OFFSET) / SCALE_FACTOR;
          const dMaxLon = (Number(d.maxLon) - LON_OFFSET) / SCALE_FACTOR;

          const farmLat = lat !== undefined ? lat : (minLat + maxLat) / 2;
          const farmLon = lon !== undefined ? lon : (minLon + maxLon) / 2;

          if (farmLat >= dMinLat && farmLat <= dMaxLat && farmLon >= dMinLon && farmLon <= dMaxLon) {
            return NextResponse.json({
              success: true,
              alreadyActive: true,
              disasterId: i,
              eventName: eventName || 'Active On-Chain Disaster',
              boundingBox: { minLat: dMinLat, maxLat: dMaxLat, minLon: dMinLon, maxLon: dMaxLon },
              onChainUnits: { uMinLat: Number(d.minLat), uMaxLat: Number(d.maxLat), uMinLon: Number(d.minLon), uMaxLon: Number(d.maxLon) }
            });
          }
        }
      }
    } catch (_) {}

    // Trigger on-chain using oracle owner key
    const signer = new ethers.Wallet(privateKey, provider);
    const oracle = new ethers.Contract(oracleAddress, AGRI_ORACLE_ABI, signer);

    const tx = await oracle.devTriggerDisaster(uMinLat, uMaxLat, uMinLon, uMaxLon);
    const receipt = await tx.wait();

    return NextResponse.json({
      success: true,
      alreadyActive: false,
      eventName: eventName || 'Dynamic Disaster Zone',
      txHash: receipt.hash,
      boundingBox: { minLat, maxLat, minLon, maxLon },
      onChainUnits: { uMinLat, uMaxLat, uMinLon, uMaxLon }
    });
  } catch (err) {
    console.error("Failed to broadcast disaster:", err);
    return NextResponse.json({
      error: err.message || "Failed to broadcast disaster on-chain",
      detail: String(err)
    }, { status: 500 });
  }
}
