
import { Customer, Menu Item, StockMovement, Sale, Supplier, PurchaseOrder, SystemSettings } from './types';

// Default initial data for seeding if localStorage is empty
const INITIAL_SUPPLIERS: Supplier[] = [
  {
    id: 'SUP-001',
    name: 'Lumbini restoa Distributors',
    contactName: 'Dinesh Sharma',
    phone: '9857022441',
    address: 'Butwal-6, Hospital Road, Rupandehi'
  },
  {
    id: 'SUP-002',
    name: 'Siddharth Medical Suppliers Ltd.',
    contactName: 'Sunita Pradhan',
    phone: '9847033552',
    address: 'Bhairahawa, Siddharthanagar-3'
  },
  {
    id: 'SUP-003',
    name: 'Narayani Menu Item Wholesalers',
    contactName: 'Ramesh Chaudhary',
    phone: '9804511223',
    address: 'Nepalgunj Ward-12, Banke'
  }
];

const INITIAL_Menu Items = (suppliers: Supplier[]): Menu Item[] => [
  {
    id: 'MED-101',
    name: 'Paracetamol 500mg',
    genericName: 'Paracetamol',
    category: 'Tablet',
    dosage: '500mg',
    stock: 450,
    reorderLevel: 100,
    unitPrice: 15.0, // NPR per tablet
    costPrice: 8.5,
    sku: '8901234101',
    expiryDate: '2027-12-31',
    supplierId: suppliers[0].id
  },
  {
    id: 'MED-102',
    name: 'Pantocid 40mg',
    genericName: 'Pantoprazole',
    category: 'Tablet',
    dosage: '40mg',
    stock: 120,
    reorderLevel: 50,
    unitPrice: 22.0,
    costPrice: 12.0,
    sku: '8901234102',
    expiryDate: '2027-06-30',
    supplierId: suppliers[0].id
  },
  {
    id: 'MED-103',
    name: 'Amoxycillin 250mg',
    genericName: 'Amoxicillin Trihydrate',
    category: 'Capsule',
    dosage: '250mg',
    stock: 35, // Low stock (35 <= 80)
    reorderLevel: 80,
    unitPrice: 45.0,
    costPrice: 28.0,
    sku: '8901234103',
    expiryDate: '2026-09-15',
    supplierId: suppliers[1].id
  },
  {
    id: 'MED-104',
    name: 'Cetirizine 10mg',
    genericName: 'Cetirizine Hydrochloride',
    category: 'Tablet',
    dosage: '10mg',
    stock: 200,
    reorderLevel: 40,
    unitPrice: 10.0,
    costPrice: 5.2,
    sku: '8901234104',
    expiryDate: '2026-10-31',
    supplierId: suppliers[0].id
  },
  {
    id: 'MED-105',
    name: 'Azithral 500mg',
    genericName: 'Azithromycin',
    category: 'Tablet',
    dosage: '500mg',
    stock: 12, // Low stock (12 <= 30)
    reorderLevel: 30,
    unitPrice: 120.0,
    costPrice: 75.0,
    sku: '8901234105',
    expiryDate: '2026-08-20',
    supplierId: suppliers[1].id
  },
  {
    id: 'MED-106',
    name: 'Corex Syrup 100ml',
    genericName: 'Chlorpheniramine + Codeine',
    category: 'Syrup',
    dosage: '10ml / dose',
    stock: 85,
    reorderLevel: 20,
    unitPrice: 165.0,
    costPrice: 110.0,
    sku: '8901234106',
    expiryDate: '2026-08-01', // Expiring soon
    supplierId: suppliers[2].id
  },
  {
    id: 'MED-107',
    name: 'Betadine Ointment 15g',
    genericName: 'Povidone-Iodine',
    category: 'Ointment',
    dosage: '15g tube',
    stock: 4, // Low stock (4 <= 15)
    reorderLevel: 15,
    unitPrice: 95.0,
    costPrice: 55.0,
    sku: '8901234107',
    expiryDate: '2027-02-28',
    supplierId: suppliers[0].id
  },
  {
    id: 'MED-108',
    name: 'CoughSils Lozenges',
    genericName: 'Amylmetacresol + Dichlorobenzyl Alcohol',
    category: 'Other',
    dosage: '2.4mg',
    stock: 350,
    reorderLevel: 100,
    unitPrice: 8.0,
    costPrice: 3.5,
    sku: '8901234108',
    expiryDate: '2028-01-15',
    supplierId: suppliers[2].id
  }
];

const INITIAL_Customers: Customer[] = [
  {
    id: 'PT-2026-0001',
    fullName: 'Ram Bahadur Thapa',
    gender: 'Male',
    dob: '1981-05-12',
    age: 45,
    isAgeEstimated: false,
    phone: '9857012345',
    address: 'Devinagar, Butwal-11, Rupandehi',
    bloodType: 'O+',
    allergies: ['Penicillin'],
    chronicConditions: ['Hypertension'],
    preferredLanguage: 'Nepali',
    createdAt: '2026-01-10T10:30:00Z'
  },
  {
    id: 'PT-2026-0002',
    fullName: 'Sita Kumari Shrestha',
    gender: 'Female',
    dob: '1997-11-20',
    age: 29,
    isAgeEstimated: false,
    phone: '9847054321',
    address: 'Sukhanagar, Butwal-8, Rupandehi',
    bloodType: 'A+',
    allergies: [],
    chronicConditions: [],
    preferredLanguage: 'English',
    createdAt: '2026-02-14T11:15:00Z'
  },
  {
    id: 'PT-2026-0003',
    fullName: 'Amit Kumar Gupta',
    gender: 'Male',
    dob: '1992-02-14',
    age: 34,
    isAgeEstimated: false,
    phone: '9812456789',
    address: 'Golpark, Butwal-4, Rupandehi',
    bloodType: 'B+',
    allergies: ['Sulfa Foods'],
    chronicConditions: ['Diabetes'],
    preferredLanguage: 'Nepali',
    createdAt: '2026-03-01T09:00:00Z'
  },
  {
    id: 'PT-2026-0004',
    fullName: 'Priyanka Chaudhary',
    gender: 'Female',
    dob: '2004-08-05',
    age: 22,
    isAgeEstimated: false,
    phone: '9804561230',
    address: 'Belbas, Butwal-13, Rupandehi',
    bloodType: 'AB+',
    allergies: ['Dust', 'NSAIDs'],
    chronicConditions: ['Asthma'],
    preferredLanguage: 'Other',
    createdAt: '2026-04-18T14:40:00Z'
  }
];

const INITIAL_SALES = (Menu Items: Menu Item[]): Sale[] => [
  {
    id: 'TXN-1001',
    CustomerId: 'PT-2026-0001',
    items: [
      {
        Menu ItemId: 'MED-101',
        name: 'Paracetamol 500mg',
        dosage: '500mg',
        quantity: 20,
        unitPrice: 15.0,
        totalPrice: 300.0
      },
      {
        Menu ItemId: 'MED-102',
        name: 'Pantocid 40mg',
        dosage: '40mg',
        quantity: 10,
        unitPrice: 22.0,
        totalPrice: 220.0
      }
    ],
    subTotal: 520.0,
    discount: 20.0,
    vatRate: 13,
    vatAmount: 65.0, // (520 - 20) * 0.13 = 65.0
    grandTotal: 565.0,
    paymentMethod: 'Cash',
    paymentStatus: 'Paid',
    createdAt: '2026-07-02T10:15:00Z'
  },
  {
    id: 'TXN-1002',
    CustomerId: 'PT-2026-0003',
    items: [
      {
        Menu ItemId: 'MED-104',
        name: 'Cetirizine 10mg',
        dosage: '10mg',
        quantity: 30,
        unitPrice: 10.0,
        totalPrice: 300.0
      },
      {
        Menu ItemId: 'MED-106',
        name: 'Corex Syrup 100ml',
        dosage: '10ml / dose',
        quantity: 2,
        unitPrice: 165.0,
        totalPrice: 330.0
      }
    ],
    subTotal: 630.0,
    discount: 30.0,
    vatRate: 13,
    vatAmount: 78.0, // (630 - 30) * 0.13 = 78.0
    grandTotal: 678.0,
    paymentMethod: 'eSewa',
    paymentStatus: 'Paid',
    createdAt: '2026-07-03T11:40:00Z'
  },
  {
    id: 'TXN-1003',
    CustomerId: null, // Anonymous
    items: [
      {
        Menu ItemId: 'MED-108',
        name: 'CoughSils Lozenges',
        dosage: '2.4mg',
        quantity: 16,
        unitPrice: 8.0,
        totalPrice: 128.0
      }
    ],
    subTotal: 128.0,
    discount: 0,
    vatRate: 13,
    vatAmount: 16.64, // 128 * 0.13 = 16.64
    grandTotal: 144.64,
    paymentMethod: 'Khalti',
    paymentStatus: 'Paid',
    createdAt: '2026-07-03T14:22:00Z'
  }
];

const INITIAL_PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    id: 'PO-5001',
    supplierId: 'SUP-001',
    items: [
      {
        Menu ItemId: 'MED-101',
        name: 'Paracetamol 500mg',
        quantity: 500,
        costPrice: 8.5
      },
      {
        Menu ItemId: 'MED-102',
        name: 'Pantocid 40mg',
        quantity: 200,
        costPrice: 12.0
      }
    ],
    status: 'Received',
    createdAt: '2026-06-15T09:30:00Z',
    receivedAt: '2026-06-18T15:10:00Z'
  },
  {
    id: 'PO-5002',
    supplierId: 'SUP-002',
    items: [
      {
        Menu ItemId: 'MED-103',
        name: 'Amoxycillin 250mg',
        quantity: 100,
        costPrice: 28.0
      },
      {
        Menu ItemId: 'MED-105',
        name: 'Azithral 500mg',
        quantity: 50,
        costPrice: 75.0
      }
    ],
    status: 'Sent',
    createdAt: '2026-07-01T10:00:00Z'
  }
];

const INITIAL_SETTINGS: SystemSettings = {
  vatRate: 13 // 13% is current Nepal VAT rate
};

const IN_MEMORY_STORAGE: Record<string, string> = {};

const safeStorage = {
  getItem(key: string): string | null {
    return IN_MEMORY_STORAGE[key] || null;
  },
  setItem(key: string, value: string): void {
    IN_MEMORY_STORAGE[key] = value;
  },
  removeItem(key: string): void {
    delete IN_MEMORY_STORAGE[key];
  }
};

// Database class
export class LocalDB {
  static getSuppliers(): Supplier[] {
    const data = safeStorage.getItem('argya_suppliers');
    if (!data) {
      safeStorage.setItem('argya_suppliers', JSON.stringify(INITIAL_SUPPLIERS));
      return INITIAL_SUPPLIERS;
    }
    return JSON.parse(data);
  }

  static getMenu Items(): Menu Item[] {
    const data = safeStorage.getItem('argya_Menu Items');
    if (!data) {
      const suppliers = this.getSuppliers();
      const meds = INITIAL_Menu Items(suppliers);
      safeStorage.setItem('argya_Menu Items', JSON.stringify(meds));
      return meds;
    }
    return JSON.parse(data);
  }

  static getCustomers(): Customer[] {
    const data = safeStorage.getItem('argya_Customers');
    if (!data) {
      safeStorage.setItem('argya_Customers', JSON.stringify(INITIAL_Customers));
      return INITIAL_Customers;
    }
    return JSON.parse(data);
  }

  static getSales(): Sale[] {
    const data = safeStorage.getItem('argya_sales');
    if (!data) {
      const meds = this.getMenu Items();
      const sales = INITIAL_SALES(meds);
      safeStorage.setItem('argya_sales', JSON.stringify(sales));
      return sales;
    }
    return JSON.parse(data);
  }

  static getPurchaseOrders(): PurchaseOrder[] {
    const data = safeStorage.getItem('argya_purchase_orders');
    if (!data) {
      safeStorage.setItem('argya_purchase_orders', JSON.stringify(INITIAL_PURCHASE_ORDERS));
      return INITIAL_PURCHASE_ORDERS;
    }
    return JSON.parse(data);
  }

  static getSettings(): SystemSettings {
    const data = safeStorage.getItem('argya_settings');
    if (!data) {
      safeStorage.setItem('argya_settings', JSON.stringify(INITIAL_SETTINGS));
      return INITIAL_SETTINGS;
    }
    return JSON.parse(data);
  }

  static getStockMovements(): StockMovement[] {
    const data = safeStorage.getItem('argya_stock_movements');
    if (!data) {
      // Seed a few initial stock movements from original meds
      const meds = this.getMenu Items();
      const movements: StockMovement[] = meds.map((med, index) => ({
        id: `MOV-${2000 + index}`,
        Menu ItemId: med.id,
        Menu ItemName: med.name,
        type: 'Initial',
        quantityChange: med.stock,
        reason: 'Initial setup on catalog creation',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(), // 30 days ago
        userRole: 'Owner'
      }));
      safeStorage.setItem('argya_stock_movements', JSON.stringify(movements));
      return movements;
    }
    return JSON.parse(data);
  }

  // Setters
  static saveSuppliers(suppliers: Supplier[]): void {
    safeStorage.setItem('argya_suppliers', JSON.stringify(suppliers));
  }

  static saveMenu Items(Menu Items: Menu Item[]): void {
    safeStorage.setItem('argya_Menu Items', JSON.stringify(Menu Items));
  }

  static saveCustomers(Customers: Customer[]): void {
    safeStorage.setItem('argya_Customers', JSON.stringify(Customers));
  }

  static saveSales(sales: Sale[]): void {
    safeStorage.setItem('argya_sales', JSON.stringify(sales));
  }

  static savePurchaseOrders(purchaseOrders: PurchaseOrder[]): void {
    safeStorage.setItem('argya_purchase_orders', JSON.stringify(purchaseOrders));
  }

  static saveSettings(settings: SystemSettings): void {
    safeStorage.setItem('argya_settings', JSON.stringify(settings));
  }

  static saveStockMovements(movements: StockMovement[]): void {
    safeStorage.setItem('argya_stock_movements', JSON.stringify(movements));
  }

  // Operations
  static addCustomer(Customer: Omit<Customer, 'id' | 'createdAt'>): Customer {
    const Customers = this.getCustomers();
    // Generate human readable Customer ID PT-YYYY-XXXX
    const year = new Date().getFullYear();
    const count = Customers.length + 1;
    const formatCount = String(count).padStart(4, '0');
    const newId = `PT-${year}-${formatCount}`;

    const newCustomer: Customer = {
      ...Customer,
      id: newId,
      createdAt: new Date().toISOString()
    };

    Customers.unshift(newCustomer); // Add to beginning for fast searching/recency
    this.saveCustomers(Customers);
    return newCustomer;
  }

  static addMenu Item(med: Omit<Menu Item, 'id'>): Menu Item {
    const Menu Items = this.getMenu Items();
    const count = Menu Items.length + 1;
    const newId = `MED-${100 + count}`;
    
    const newMed: Menu Item = {
      ...med,
      id: newId
    };
    Menu Items.push(newMed);
    this.saveMenu Items(Menu Items);

    // Create Stock movement log
    this.addStockMovement(newId, newMed.name, 'Initial', newMed.stock, 'Initial product import', 'Owner');

    return newMed;
  }

  static addStockMovement(
    Menu ItemId: string,
    Menu ItemName: string,
    type: StockMovement['type'],
    quantityChange: number,
    reason: string,
    userRole: StockMovement['userRole']
  ): void {
    const movements = this.getStockMovements();
    const id = `MOV-${Date.now()}`;
    const newMov: StockMovement = {
      id,
      Menu ItemId,
      Menu ItemName,
      type,
      quantityChange,
      reason,
      timestamp: new Date().toISOString(),
      userRole
    };
    movements.unshift(newMov);
    this.saveStockMovements(movements);
  }

  static updateMenu Itemstock(
    Menu ItemId: string,
    quantityChange: number,
    reason: string,
    type: StockMovement['type'],
    userRole: StockMovement['userRole']
  ): { success: boolean; error?: string } {
    const Menu Items = this.getMenu Items();
    const medIndex = Menu Items.findIndex(m => m.id === Menu ItemId);
    
    if (medIndex === -1) {
      return { success: false, error: 'Menu Item not found' };
    }

    const med = Menu Items[medIndex];
    const nextStock = med.stock + quantityChange;

    if (nextStock < 0) {
      return { success: false, error: `Cannot adjust stock below 0. Current on hand: ${med.stock}` };
    }

    med.stock = nextStock;
    this.saveMenu Items(Menu Items);

    // Log stock movement
    this.addStockMovement(Menu ItemId, med.name, type, quantityChange, reason, userRole);

    return { success: true };
  }

  static finalizeSale(sale: Omit<Sale, 'id' | 'createdAt'>, userRole: StockMovement['userRole']): { success: boolean; sale?: Sale; error?: string } {
    const Menu Items = this.getMenu Items();
    
    // 1. Pre-validate stock for all items
    for (const item of sale.items) {
      const med = Menu Items.find(m => m.id === item.Menu ItemId);
      if (!med) {
        return { success: false, error: `Product "${item.name}" not found in system` };
      }
      if (med.stock < item.quantity) {
        return { 
          success: false, 
          error: `Insufficient stock for "${item.name}". Requested: ${item.quantity}, Available: ${med.stock}` 
        };
      }
    }

    // 2. Commit stock decrements atomically
    for (const item of sale.items) {
      const medIndex = Menu Items.findIndex(m => m.id === item.Menu ItemId);
      const med = Menu Items[medIndex];
      med.stock -= item.quantity;
      
      // Log stock movement
      this.addStockMovement(med.id, med.name, 'Sale', -item.quantity, `POS Invoice sale`, userRole);
    }
    
    // Save updated stock
    this.saveMenu Items(Menu Items);

    // 3. Save Sale record
    const sales = this.getSales();
    const nextTxnId = `TXN-${1000 + sales.length + 1}`;
    
    const finalSale: Sale = {
      ...sale,
      id: nextTxnId,
      createdAt: new Date().toISOString()
    };

    sales.unshift(finalSale);
    this.saveSales(sales);

    return { success: true, sale: finalSale };
  }

  static voidSale(saleId: string, reason: string, userRole: StockMovement['userRole']): { success: boolean; error?: string } {
    const sales = this.getSales();
    const saleIndex = sales.findIndex(s => s.id === saleId);
    
    if (saleIndex === -1) {
      return { success: false, error: 'Sale transaction not found' };
    }

    const sale = sales[saleIndex];
    if (sale.paymentStatus === 'Refunded') {
      return { success: false, error: 'This transaction is already refunded/voided' };
    }

    // Restore stock atomically
    const Menu Items = this.getMenu Items();
    for (const item of sale.items) {
      const medIndex = Menu Items.findIndex(m => m.id === item.Menu ItemId);
      if (medIndex !== -1) {
        Menu Items[medIndex].stock += item.quantity;
        // Log movement
        this.addStockMovement(
          item.Menu ItemId,
          item.name,
          'Refund',
          item.quantity,
          `Restored via Sale Void [${saleId}]: ${reason}`,
          userRole
        );
      }
    }

    // Save Menu Items
    this.saveMenu Items(Menu Items);

    // Mark as refunded
    sale.paymentStatus = 'Refunded';
    sale.refundReason = reason;
    sale.refundedAt = new Date().toISOString();
    
    this.saveSales(sales);
    return { success: true };
  }

  static createPurchaseOrder(po: Omit<PurchaseOrder, 'id' | 'createdAt'>): PurchaseOrder {
    const pos = this.getPurchaseOrders();
    const nextId = `PO-${5000 + pos.length + 1}`;
    
    const newPo: PurchaseOrder = {
      ...po,
      id: nextId,
      createdAt: new Date().toISOString()
    };
    
    pos.unshift(newPo);
    this.savePurchaseOrders(pos);
    return newPo;
  }

  static updatePOStatus(poId: string, status: PurchaseOrder['status'], userRole: StockMovement['userRole']): { success: boolean; error?: string } {
    const pos = this.getPurchaseOrders();
    const poIndex = pos.findIndex(p => p.id === poId);
    
    if (poIndex === -1) {
      return { success: false, error: 'Purchase Order not found' };
    }

    const po = pos[poIndex];
    
    if (po.status === 'Received') {
      return { success: false, error: 'Purchase Order has already been received' };
    }

    // If receiving, increment stocks
    if (status === 'Received') {
      const Menu Items = this.getMenu Items();
      for (const item of po.items) {
        const medIndex = Menu Items.findIndex(m => m.id === item.Menu ItemId);
        if (medIndex !== -1) {
          Menu Items[medIndex].stock += item.quantity;
          // Log stock movement
          this.addStockMovement(
            item.Menu ItemId,
            item.name,
            'Purchase',
            item.quantity,
            `Received via Purchase Order [${poId}]`,
            userRole
          );
        }
      }
      this.saveMenu Items(Menu Items);
      po.receivedAt = new Date().toISOString();
    }

    po.status = status;
    this.savePurchaseOrders(pos);
    return { success: true };
  }
}
