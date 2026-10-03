import React, { useEffect, useRef, useState } from 'react';
import { MapPin, ExternalLink, Navigation } from 'lucide-react';
import { GOOGLE_MAPS_KEY } from './shared';

// =====================================================================
// MAP (optional). Works in 2 modes:
//   • VITE_GOOGLE_MAPS_KEY set   → real Google Map with pins (customer, restaurant, rider)
//   • no key                     → friendly card with "Open in Google Maps" links
// So the whole delivery system works even before you create a Maps key.
// =====================================================================
type Pt = { lat: number | null | undefined; lng: number | null | undefined } | null | undefined;
const ok = (p: Pt): p is { lat: number; lng: number } => !!p && typeof p.lat === 'number' && typeof p.lng === 'number';

let loader: Promise<void> | null = null;
function loadGoogle(): Promise<void> {
  if ((window as any).google?.maps) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loader = null; reject(new Error('Google Maps failed to load')); };
    document.head.appendChild(s);
  });
  return loader;
}

export default function MapView({
  customer, restaurant, rider, height = 280, customerLabel = 'Delivery address',
}: { customer?: Pt; restaurant?: Pt; rider?: Pt; height?: number; customerLabel?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const markers = useRef<Record<string, any>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !box.current) return;
    let dead = false;
    loadGoogle()
      .then(() => {
        if (dead || !box.current) return;
        const g = (window as any).google;
        const first = [customer, restaurant, rider].find(ok) as { lat: number; lng: number } | undefined;
        if (!first) return;
        if (!map.current) {
          map.current = new g.maps.Map(box.current, {
            center: first, zoom: 15, disableDefaultUI: true, zoomControl: true, gestureHandling: 'cooperative',
            styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
          });
        }
        const put = (key: string, p: Pt, color: string, title: string, emoji: string) => {
          if (!ok(p)) { markers.current[key]?.setMap(null); delete markers.current[key]; return; }
          if (!markers.current[key]) {
            markers.current[key] = new g.maps.Marker({
              map: map.current, position: p, title,
              label: { text: emoji, fontSize: '18px' },
              icon: { path: g.maps.SymbolPath.CIRCLE, scale: 17, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
            });
          } else markers.current[key].setPosition(p);
        };
        put('customer', customer, '#7c3aed', customerLabel, '🏠');
        put('restaurant', restaurant, '#f59e0b', 'Restaurant', '🍽️');
        put('rider', rider, '#10b981', 'Rider', '🛵');

        const pts = [customer, restaurant, rider].filter(ok) as { lat: number; lng: number }[];
        if (pts.length > 1) {
          const b = new g.maps.LatLngBounds();
          pts.forEach((p) => b.extend(p));
          map.current.fitBounds(b, 60);
        } else map.current.setCenter(pts[0]);
      })
      .catch(() => setFailed(true));
    return () => { dead = true; };
  }, [customer?.lat, customer?.lng, restaurant?.lat, restaurant?.lng, rider?.lat, rider?.lng, customerLabel]);

  const anyPoint = [customer, restaurant, rider].some(ok);

  // ---- fallback (no key, failed to load, or no coordinates yet) ----
  if (!GOOGLE_MAPS_KEY || failed || !anyPoint) {
    return (
      <div className="rounded-2xl border border-dashed border-purple-200 bg-gradient-to-br from-purple-50 to-white p-5 text-center">
        <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-purple-100 text-purple-600"><MapPin className="h-5 w-5" /></div>
        <p className="text-sm font-semibold text-slate-800">{anyPoint ? 'Live map is not switched on' : 'No map pin for this address'}</p>
        <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500">
          {anyPoint ? 'Add a Google Maps key (VITE_GOOGLE_MAPS_KEY) to see pins and the rider moving.' : 'The customer did not share a location pin.'}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {ok(customer) && (
            <a className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-purple-700 ring-1 ring-purple-200 hover:bg-purple-50" target="_blank" rel="noreferrer"
               href={`https://www.google.com/maps/search/?api=1&query=${customer.lat},${customer.lng}`}>
              <ExternalLink className="h-3.5 w-3.5" /> Customer pin
            </a>
          )}
          {ok(rider) && (
            <a className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50" target="_blank" rel="noreferrer"
               href={`https://www.google.com/maps/search/?api=1&query=${rider.lat},${rider.lng}`}>
              <Navigation className="h-3.5 w-3.5" /> Rider now
            </a>
          )}
        </div>
      </div>
    );
  }
  return <div ref={box} style={{ height }} className="w-full overflow-hidden rounded-2xl ring-1 ring-purple-100" />;
}