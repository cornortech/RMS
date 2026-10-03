import React, { useState } from 'react';
import { Bike, ClipboardList, Users, SlidersHorizontal, BarChart3 } from 'lucide-react';
import DeliveryOrders from './DeliveryOrders';
import RiderManager from './RiderManager';
import DeliverySettings from './DeliverySettings';
import DeliveryReports from './DeliveryReports';

// The "Delivery" section of the RMS. One page, four tabs.
type Tab = 'orders' | 'riders' | 'settings' | 'reports';

export default function DeliveryHub({ role }: { role: string }) {
  const isManager = role === 'Manager';
  const isKitchen = role === 'Kitchen Staff';

  const tabs: { k: Tab; label: string; icon: React.ElementType }[] = [
    { k: 'orders', label: 'Orders', icon: ClipboardList },
    ...(!isKitchen ? [{ k: 'riders' as Tab, label: 'Riders', icon: Users }] : []),
    ...(isManager || role === 'Cashier' ? [{ k: 'reports' as Tab, label: 'Reports', icon: BarChart3 }] : []),
    ...(!isKitchen ? [{ k: 'settings' as Tab, label: 'Settings', icon: SlidersHorizontal }] : []),
  ];
  const [tab, setTab] = useState<Tab>('orders');

  return (
    <div className="space-y-6">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600 via-violet-600 to-indigo-700 p-6 text-white shadow-xl shadow-purple-500/20">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-fuchsia-400/30 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-amber-300/20 blur-2xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur anim-floaty"><Bike className="h-7 w-7" /></div>
          <div>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">Cloud Kitchen Delivery</h1>
            <p className="text-sm text-purple-100">Website orders, riders and live tracking in one place.</p>
          </div>
        </div>
        <nav className="relative mt-5 flex gap-2 overflow-x-auto" aria-label="Delivery sections">
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === t.k ? 'bg-white text-purple-700 shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'}`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'orders' && <DeliveryOrders role={role} />}
      {tab === 'riders' && <RiderManager canEdit={isManager} />}
      {tab === 'reports' && <DeliveryReports />}
      {tab === 'settings' && <DeliverySettings canEdit={isManager} />}
    </div>
  );
}