const fs = require('fs');
let content = fs.readFileSync('src/pages/Inventory.tsx', 'utf-8');

// Replace Image Box
content = content.replace(
  /<Package className="h-8 w-8 text-slate-600" \/>\s*<\/div>/g,
  '<Package className="h-8 w-8 text-slate-600" />\n}</div>'
).replace(
  /<div className="h-20 w-20 bg-slate-800 rounded-md border border-slate-700 flex-shrink-0 flex items-center justify-center overflow-hidden">/g,
  '<div className="h-20 w-20 bg-slate-800 rounded-md border border-slate-700 flex-shrink-0 flex items-center justify-center overflow-hidden relative">\n{row.image_url ? <img src={row.image_url} alt={row.product_name || row.name} className="object-cover w-full h-full absolute inset-0" /> :'
);

// Replace View Product button
content = content.replace(
  /onClick=\{\(\) => \{\}\}>\s+View Product/g,
  'onClick={() => navigate("/products")}>\n                          View Product'
);

// Add isRawMaterial flag to the product payload
content = content.replace(
  /setSelectedProduct\(\{ id: row.product_id, name: row.product_name, unit: row.unit \}\);/g,
  'setSelectedProduct({ id: row.product_id, name: row.product_name, unit: row.unit, isRawMaterial: false });'
);

// Replace the Top right "Products" Button
content = content.replace(
  /<Button variant="outline" className="gap-2">\s+Products <ArrowUpRight className="h-4 w-4" \/>\s+<\/Button>/g,
  ''
);

// Add RawMaterials Tab instead of `<RawMaterials />`
const rawMaterialsTabReplacement = `
          <TabsContent value="raw-materials" className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="relative w-full max-w-sm">
                <Input
                  placeholder="Search raw materials..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {loadRawMaterials ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
                {rawMaterials
                  ?.filter((rm: any) => rm.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((rm: any) => (
                    <Card key={rm.id} className="bg-[#1C212E] border-slate-800 text-slate-100 flex flex-col p-5">
                      <div className="flex gap-4">
                        <div className="h-20 w-20 bg-slate-800 rounded-md border border-slate-700 flex-shrink-0 flex items-center justify-center overflow-hidden relative">
                          {rm.image_url ? (
                            <img src={rm.image_url} alt={rm.name} className="object-cover w-full h-full absolute inset-0" />
                          ) : (
                            <Package className="h-8 w-8 text-slate-600" />
                          )}
                        </div>
                        <div className="flex-1 flex flex-col justify-between">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-bold text-lg text-white leading-tight">{rm.name}</h3>
                              <p className="text-sm text-slate-400 mt-0.5">{rm.display_id}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm border-t border-slate-800 pt-4">
                        <div className="flex justify-between items-center text-slate-400">
                          <span>Total Stock</span>
                          <span className="text-white text-base font-bold tabular-nums">
                            {rm.current_stock?.toFixed(1)} {rm.unit}
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 flex gap-3 pt-2">
                        <Button variant="secondary" className="flex-1 bg-slate-800 text-slate-200 hover:bg-slate-700 border-0" onClick={() => navigate("/raw-materials")}>
                          View Details <ArrowUpRight className="w-3 h-3 ml-2 opacity-70" />
                        </Button>
                        <Button className="flex-1 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => {
                          setSelectedProduct({ id: rm.id, name: rm.name, unit: rm.unit, isRawMaterial: true });
                          setShowAdjust(true);
                        }}>
                          - Reduce Stock
                        </Button>
                      </div>
                    </Card>
                ))}
              </div>
            )}
          </TabsContent>
`;

content = content.replace(
  /<TabsContent value="raw-materials">\s*<RawMaterials \/>\s*<\/TabsContent>/g,
  rawMaterialsTabReplacement
);

// We need to also patch the handleAdjust function so it supports Raw Material Reduce Stock
const adjustHookStr = `
    const handleAdjust = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedWarehouseId || !selectedProduct) return;
      setSaving(true);
      try {
        const qty = parseFloat(adjustQty);
        if (isNaN(qty) || qty === 0) throw new Error("Invalid quantity");

        if (selectedProduct.isRawMaterial) {
          // Negative quantity for raw material reduction
          const finalQty = -Math.abs(qty);
          if (finalQty > 0) throw new Error("You can only decrease raw material stock directly. Increase must be via record purchase.");

          const { data: rm } = await supabase.from('raw_materials').select('current_stock, display_id').eq('id', selectedProduct.id).single();
          if (!rm) throw new Error("Material not found");
          const newQty = (rm.current_stock || 0) + finalQty;
          
          await supabase.from('raw_materials').update({ current_stock: newQty }).eq('id', selectedProduct.id);
          await supabase.from('raw_material_adjustments').insert({
             display_id: rm.display_id + "-" + Date.now(),
             raw_material_id: selectedProduct.id,
             warehouse_id: selectedWarehouseId,
             adjustment_type: 'used',
             quantity_before: rm.current_stock,
             quantity_change: finalQty,
             quantity_after: newQty,
             reason: adjustReason,
             adjusted_by: user?.id
          });
          
          toast.success("Raw Material stock reduced successfully");
        } else {
          // Existing product movement
          let finalQty = qty;
          if (["sale", "transfer_out"].includes(adjustType)) {
            finalQty = -Math.abs(qty);
          } else if (["purchase", "return", "transfer_in"].includes(adjustType)) {
            finalQty = Math.abs(qty);
          }

          const { error } = await supabase.rpc("record_stock_movement", {
            p_product_id: selectedProduct.id,
            p_warehouse_id: selectedWarehouseId,
            p_quantity: finalQty,
            p_type: adjustType,
            p_reason: adjustReason,
            p_user_id: user?.id,
          });

          if (error) throw error;
          toast.success("Stock updated successfully");
        }

        setShowAdjust(false);
        setAdjustQty("");
        setAdjustReason("");
        qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
        qc.invalidateQueries({ queryKey: ["stock-movements"] });
        qc.invalidateQueries({ queryKey: ["raw-materials-stock"] });
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setSaving(false);
      }
    };
`;

content = content.replace(
  /const handleAdjust = async \(e: React\.FormEvent\) => \{[\s\S]*?finally \{\s*setSaving\(false\);\s*\}\s*\};/g,
  adjustHookStr
);

// We need to only let Raw Material be "used" (decreasing). 
const selectAdjustTypeStr = `
                  <div className="space-y-2">
                    <Label>Adjustment Type</Label>
                    {selectedProduct?.isRawMaterial ? (
                      <p className="text-sm font-medium text-slate-300 bg-slate-800 p-2 rounded-md border border-slate-700">Decrease Stock (Consumption / Loss)</p>
                    ) : (
                    <Select value={adjustType} onValueChange={(val: any) => setAdjustType(val)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Type of adjustment..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(MOVEMENT_TYPES).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    )}
                  </div>
`;

content = content.replace(
  /<div className="space-y-2">\s*<Label>Adjustment Type<\/Label>\s*<Select value=\{adjustType\} onValueChange=\{\(val: any\) => setAdjustType\(val\)\}>[\s\S]*?<\/SelectContent>\s*<\/Select>\s*<\/div>/g,
  selectAdjustTypeStr
);

// finally, the import of RawMaterials was already replaced via the tool earlier, 
// wait we need to make sure Search is imported!
if (!content.includes('Search,')) {
    content = content.replace('XCircle,', 'XCircle,\n  Search,');
}

fs.writeFileSync('src/pages/Inventory.tsx', content);
console.log("Success");
