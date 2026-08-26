export const reportsData = [
  {
    key: 'accounting',
    label: 'Accounting Reports',
    subCategories: [
      {
        key: 'journal-entry-reports',
        label: 'Journal Entry Reports',
        sections: [
          {
            key: 'journal-entry',
            label: 'Journal Entry Reports',
            items: [
              { code: 'R1A01', name: 'Account Activity By ID' },
              { code: 'R1A02', name: 'List of Unposted Entries' },
              { code: 'R1A03', name: 'Cash Position Report' },
              { code: 'R1A04', name: 'Unposted Entries' },
              { code: 'R1A05', name: 'Account Movement Summary' },
            ],
          },
          {
            key: 'tax',
            label: 'Summary of Tax Reports',
            items: [
              { code: 'R1A06', name: 'Summary of input tax' },
              { code: 'R1A061', name: 'Summary of Output Tax (Loan Collection)' },
            ],
          },
          {
            key: 'others',
            label: 'Others',
            items: [
              { code: 'R1A07', name: 'Summary of statement of accounts' },
              { code: 'R1A081', name: 'Unbalance Journal List' },
              { code: 'R1A082', name: 'Subsidiary Accounts without Subsidiary Report' },
              { code: 'R1A083', name: 'Mismatch Accounting Periods to Journal Dates Report' },
              { code: 'R1A084', name: 'Without Account Link Report' },
              { code: 'R1A085', name: 'Subsidiary Transactions with Different Account Link Report' },
            ],
          },
        ],
      },
      {
        key: 'issued-check-reports',
        label: 'Issued Check Reports',
        sections: [
          {
            key: 'issued-check-reports',
            label: 'Issued Check Reports',
            items: [
              { code: 'R2A01', name: 'By entry date report' },
              { code: 'R2A02', name: 'By check date report' },
              { code: 'R2A03', name: 'By check number report' },
            ],
          },
        ],
      },
      {
        key: 'general-journal-ledger-reports',
        label: 'General Journal Ledger Reports',
        sections: [
          {
            key: 'general-journal-ledger-reports',
            label: 'General Journal Ledger Reports',
            items: [
              { code: 'R3A01', name: 'General Journal' },
              { code: 'R3A02', name: 'View GL activity by account ID' },
              { code: 'R3A03', name: 'View GL by journal ID' },
              { code: 'R3A04', name: 'GL summary by account ID' },
            ],
          },
        ],
      },
      {
        key: 'subledger-reports',
        label: 'Subledger Reports',
        sections: [
          {
            key: 'subledger-customer',
            label: 'Subledger Customer Reports',
            items: [
              { code: 'R4A01', name: 'Customer Ledger' },
              { code: 'R4A02', name: 'Balances from Customer' },
              { code: 'R4A03', name: 'Customers Aging Report' },
            ],
          },
          {
            key: 'subledger-supplier',
            label: 'Subledger Supplier Reports',
            items: [
              { code: 'R4A04', name: 'Suppliers Ledger' },
              { code: 'R4A05', name: 'Balances to Supplier' },
              { code: 'R4A06', name: 'Suppliers Aging Report' },
            ],
          },
        ],
      },
      {
        key: 'financial-statements-reports',
        label: 'Financial Statements Reports',
        sections: [
          {
            key: 'financial-statements-reports',
            label: 'Financial Statements Reports',
            items: [
              { code: 'R5A01', name: 'Trial Balance' },
              { code: 'R5A02', name: 'Adjusted Balance Sheet' },
              { code: 'R5A03', name: 'Balance Sheet' },
              { code: 'R5A04', name: 'Balance Summary Sheet' },
              { code: 'R5A05', name: 'Comparative balance sheet' },
              { code: 'R5A06', name: 'Comparative monthly balance sheet' },
              { code: 'R5A07', name: 'Income Statement' },
              { code: 'R5A08', name: 'Income Statement Summary' },
              { code: 'R5A09', name: 'Comparative income statement' },
              { code: 'R5A10', name: 'Comparative month income statement' },
              { code: 'R5A11', name: 'Comparative income statement per cost center' },
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory Reports',
    subCategories: [
      {
        key: 'purchase-request',
        label: 'Purchase Request Reports',
        sections: [
          {
            key: 'purchase-request',
            label: 'Purchase Request Reports',
            items: [
              { code: 'R1I01', name: 'Purchase Request Reports By Date' },
              { code: 'R1I02', name: 'Purchase Request Reports By PR Number' },
              { code: 'R1I03', name: 'Purchase Request Reports By Items' },
            ],
          },
        ],
      },
      {
        key: 'purchase-orders-reports',
        label: 'Purchase Orders Reports',
        sections: [
          {
            key: 'purchase-orders-reports',
            label: 'Purchase Orders Reports',
            items: [
              { code: 'R2I01', name: 'Purchase Orders By Date' },
              { code: 'R2I03', name: 'Purchase Orders By Supplier' },
              { code: 'R2I04', name: 'Purchase Orders By Items' },
            ],
          },
        ],
      },
      {
        key: 'receiving-po-reports',
        label: 'Receiving P.O. Reports',
        sections: [
          {
            key: 'receiving-po-reports',
            label: 'Receiving P.O. Reports',
            items: [
              { code: 'R3I01', name: 'Receiving P.O. By Date' },
              { code: 'R3I02', name: 'Receiving P.O. By RR Number' },
              { code: 'R3I03', name: 'Receiving P.O. By Items' },
            ],
          },
        ],
      },
      {
        key: 'direct-purchase-reports',
        label: 'Direct Purchase Reports',
        sections: [
          {
            key: 'direct-purchase-reports',
            label: 'Direct Purchase Reports',
            items: [
              { code: 'R4I01', name: 'Direct Purchases By Date' },
              { code: 'R4I02', name: 'Direct Purchases By Purchase Number' },
              { code: 'R4I03', name: 'Direct Purchases By Supplier' },
              { code: 'R4I04', name: 'Direct Purchases By Items' },
            ],
          },
        ],
      },
      {
        key: 'stock-issuance-reports',
        label: 'Stock Issuance Reports',
        sections: [
          {
            key: 'stock-issuance-reports',
            label: 'Stock Issuance Reports',
            items: [
              { code: 'R5I01', name: 'Stock Issuance By Date' },
              { code: 'R5I02', name: 'Stock Issuance By Iss Number' },
              { code: 'R5I03', name: 'Stock Issuance By Item' },
              { code: 'R5I04', name: 'Stock Issuance By Sub Cost Center / Project' },
            ],
          },
        ],
      },
      {
        key: 'stock-transfer-reports',
        label: 'Stock Transfer Reports',
        sections: [
          {
            key: 'stock-transfer-reports',
            label: 'Stock Transfer Reports',
            items: [
              { code: 'R6I01', name: 'Stock Transfer By Date' },
              { code: 'R6I02', name: 'Stock Transfer By Trans Number' },
              { code: 'R6I03', name: 'Stock Transfer By Items' },
            ],
          },
        ],
      },
      {
        key: 'stock-adjustment-reports',
        label: 'Stock Adjustment Reports',
        sections: [
          {
            key: 'stock-adjustment-reports',
            label: 'Stock Adjustment Reports',
            items: [
              { code: 'R7I01', name: 'Stock Adjustment By Date' },
              { code: 'R7I02', name: 'Stock Adjustment By Adj Number' },
              { code: 'R7I03', name: 'Stock Adjustment By Items' },
            ],
          },
        ],
      },
      {
        key: 'other-inventory-reports',
        label: 'Other Inventory Reports',
        sections: [
          {
            key: 'other-inventory-reports',
            label: 'Other Inventory Reports',
            items: [
              { code: 'R10I00', name: 'Inventory Valuation' },
              { code: 'R11I00', name: 'Reorder Report' },
              { code: 'R8I00', name: 'Item Transaction Card' },
              { code: 'R9I00', name: 'Inventory Summary By Date' },
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'crm',
    label: 'CRM Reports',
    subCategories: [
      {
        key: 'crm-reports',
        label: 'CRM Reports',
        sections: [
          {
            key: 'crm-reports',
            label: 'CRM Reports',
            items: [
              { code: 'R1C01', name: 'Appoinment Report by Date' },
              { code: 'R1C02', name: 'No Show' },
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'sales',
    label: 'Sales Reports',
    subCategories: [
      {
        key: 'sales-reports',
        label: 'Sales Reports',
        sections: [
          {
            key: 'sales-reports',
            label: 'Sales Reports',
            items: [
              { code: 'R1O00', name: 'OTC Sales Report' },
              { code: 'R1S00', name: 'Sales Cashier Report' },
              { code: 'R2O00', name: 'OTC Cashiers Report' },
              { code: 'R2S00', name: 'Sales Report By Date' },
              { code: 'R3O00', name: 'Sales Report by Item' },
              { code: 'R3S00', name: 'Sales Report By Sales' },
              { code: 'R4O00', name: 'Sales Report by Staff' },
              { code: 'R4S00', name: 'Sales Report By Market Segment' },
              { code: 'R5O00', name: 'Sales Report Summary' },
              { code: 'R5S00', name: 'Sales Report By Brand' },
              { code: 'R6O00', name: 'Summary of Item Sold & Material Usage' },
              { code: 'R6S00', name: 'Sales Report By Model' },
            ],
          },
        ],
      },
    ],
  },
];