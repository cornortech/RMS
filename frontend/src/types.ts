export interface Customer {
  id: string;
  _id?: string;
  fullName: string;
  name?: string;
  phone?: string;
}

export interface SaleItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Sale {
  id: string;
  customerId: string | null;
  restaurantName?: string;
  location?: string;
  panOrVat?: string;
  items: SaleItem[];
  subTotal: number;
  discount: number;
  vatRate: number;
  vatAmount: number;
  grandTotal: number;
  paymentMethod: 'Cash' | 'eSewa' | 'Khalti' | 'IMEPay' | 'Card' | 'Due' | 'Pending' | 'Split';
  paymentStatus?: string;
  createdAt: string;
  refundReason?: string;
  refundedAt?: string;
}