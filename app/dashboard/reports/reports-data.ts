export const reportsData = [
  {
    key: 'accounting',
    label: 'Accounting Reports',
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
    key: 'loan',
    label: 'Loan Reports',
    sections: [
      {
        key: 'loan-application',
        label: 'Loan Application Reports',
        items: [
          { code: 'R1L01', name: 'Loan Application By Date Report' },
          { code: 'R1L02', name: 'Loan Application By Loan Type Report' },
          { code: 'R1L03', name: 'Pending Application (Unreleased Cheque) Report' },
          { code: 'R1L04', name: 'Released Cheque Application Report' },
          { code: 'R1L05', name: 'Cancelled Loan Application Report' },
          { code: 'R1L06', name: 'Disapproved Loan Application Report' },
          { code: 'R1L07', name: 'Reason for Loan Report' },
        ],
      },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory Reports',
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

  // ADD THIS
  {
    key: 'sales',
    label: 'Sales Reports',
    sections: [
      {
        key: 'sales-reports',
        label: 'Sales Reports',
        items: [
          { code: 'R1000', name: 'OTC Sales Report' },
          { code: 'R1S00', name: 'Sales Cashier Report' },
          { code: 'R2000', name: 'OTC Cashiers Report' },
          { code: 'R2500', name: 'Sales Report By Date' },
          { code: 'R3000', name: 'Sales Report by Item' },
          { code: 'R3500', name: 'Sales Report By Sales' },
          { code: 'R4000', name: 'Sales Report by Staff' },
          { code: 'R4500', name: 'Sales Report By Market Segment' },
          { code: 'R5000', name: 'Sales Report Summary' },
          { code: 'R5500', name: 'Sales Report By Brand' },
          { code: 'R6000', name: 'Summary of Item Sold & Material Usage' },
          { code: 'R6500', name: 'Sales Report By Model' },
        ],
      },
    ],
  },
];