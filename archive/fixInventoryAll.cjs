const fs = require('fs');

function processFile(file, processor) {
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');
  const newCode = processor(code);
  if (code !== newCode) {
    fs.writeFileSync(file, newCode);
    console.log('Fixed', file);
  }
}

// 1. useStaffStock.ts
processFile('src/hooks/inventory/useStaffStock.ts', code => {
  // If there's a stock transfer, check generate_display_id and amount validations
  return code;
});

// 2. useWarehouseStock.ts (already fixed)
processFile('src/hooks/inventory/useWarehouseStock.ts', code => {
  return code;
});

// 3. StockHistoryView.tsx
processFile('src/components/inventory/StockHistoryView.tsx', code => {
  // Maybe valid string types for return/reason?
  return code;
});

// 4. ManagerReturnDashboard.tsx
processFile('src/components/inventory/ManagerReturnDashboard.tsx', code => {
  return code;
});

// 5. ReturnReviewModal.tsx
processFile('src/components/inventory/ReturnReviewModal.tsx', code => {
  return code;
});

// 6. StockAdjustmentModal.tsx
processFile('src/components/inventory/StockAdjustmentModal.tsx', code => {
  if (!code.includes('generate_display_id')) {
    code = code.replace(
      'await updateWarehouseStock.mutateAsync(',
      '// Add display ID generation if needed\n      await updateWarehouseStock.mutateAsync('
    );
    // Let's add basic quantity > 0 validation if it doesn't exist
    if (!code.includes('quantity <= 0')) {
      code = code.replace(
        'if (!productId || !type) {',
        'if (!productId || !type) {\n      toast.error("Please select a product and adjustment type");\n      return;\n    }\n    if (quantity <= 0) {\n      toast.error("Quantity must be greater than 0");\n      return;'
      );
    }
  }
  return code;
});

// 7. StockTransferModal.tsx
processFile('src/components/inventory/StockTransferModal.tsx', code => {
  // Add basic quantity > 0 validation
  if (!code.includes('quantity <= 0')) {
    code = code.replace(
      'if (!productId) {',
      'if (!productId) {\n      toast.error("Please select a product");\n      return;\n    }\n    if (quantity <= 0) {\n      toast.error("Quantity must be greater than 0");\n      return;'
    );
  }
  return code;
});
