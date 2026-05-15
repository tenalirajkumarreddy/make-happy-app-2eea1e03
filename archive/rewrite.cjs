const fs = require('fs');
const file = 'src/pages/Inventory.tsx';
let txt = fs.readFileSync(file, 'utf8');

// 1. Add imports
if (!txt.includes('Progress')) {
  txt = txt.replace('import { Badge } from "@/components/ui/badge";', 'import { Badge } from "@/components/ui/badge";\nimport { Progress } from "@/components/ui/progress";');
}
if (!txt.includes('ArrowUpRight')) {
  txt = txt.replace('Loader2,', 'ArrowUpRight,\n  Loader2,');
}

// 2. Add searchQuery state
if (!txt.includes('const [searchQuery, setSearchQuery]')) {
  txt = txt.replace('const [selectedProduct, setSelectedProduct] = useState<any>(null);', 'const [selectedProduct, setSelectedProduct] = useState<any>(null);\n  const [searchQuery, setSearchQuery] = useState("");');
}

// 3. Rewrite render
const renderStart = txt.indexOf('  return (');
const renderEnd = txt.lastIndexOf('export default Inventory;');

const newRender = `  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header Container */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory Management</h1>
          <p className="text-sm text-muted-foreground">Manage products and raw materials stock by warehouse</p>
        </div>
        
        <div className="flex items-center gap-3">
          {warehouses && warehouses.length > 0 && (
            <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Warehouse" />
              </SelectTrigger>
              <SelectContent>
                {warehouses?.map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" className="gap-2">
            Products <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Tabs Layout */}
      <Tabs defaultValue="products" className="space-y-6 mt-4">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="raw-materials">Raw Materials</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="relative w-full max-w-sm">
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              {stockBreakdown
                .filter(p => !searchQuery || p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) || p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((row) => {
                const staffQty = row.staff_holdings.reduce((a, b) => a + b.quantity, 0);
                const totalQty = row.total_quantity;
                const value = totalQty * row.base_price;
                const warehousePct = totalQty > 0 ? (row.warehouse_quantity / totalQty) * 100 : 0;
                const staffPct = totalQty > 0 ? (staffQty / totalQty) * 100 : 0;

                return (
                  <Card key={row.product_id} className="bg-[#1C212E] border-slate-800 text-slate-100 flex flex-col p-5">
                    <div className="flex gap-4">
                      {/* Image Box */}
                      <div className="h-20 w-20 bg-slate-800 rounded-md border border-slate-700 flex-shrink-0 flex items-center justify-center overflow-hidden">
                        <Package className="h-8 w-8 text-slate-600" />
                      </div>
                      
                      <div className="flex-1 flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-bold text-lg text-white leading-tight">{row.product_name}</h3>
                            <p className="text-sm text-slate-400 mt-0.5">{row.sku}</p>
                          </div>
                          {totalQty > 0 ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-0 uppercase rounded-sm h-6 px-2 text-[10px] font-bold">
                              IN STOCK
                            </Badge>
                          ) : (
                            <Badge className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border-0 uppercase rounded-sm h-6 px-2 text-[10px] font-bold">
                              OUT OF STOCK
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-5">
                      <div>
                        <p className="text-xs text-slate-500 font-semibold tracking-wider mb-1">PRICE</p>
                        <p className="text-sm font-medium">₹{row.base_price.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-semibold tracking-wider mb-1">STOCK VALUE</p>
                        <p className="text-sm font-medium">₹{value.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="mt-5 bg-slate-800/50 rounded-lg p-4 pb-5 border border-slate-700/50">
                      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">CURRENT STOCK</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-emerald-400 leading-none">{totalQty}</span>
                        <span className="text-sm text-slate-400 font-medium"> Cases</span>
                      </div>
                      
                      <div className="mt-4 flex items-center gap-3">
                        <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-slate-700">
                          <div className="h-full bg-emerald-500" style={{ width: warehousePct + "%" }} />
                          <div className="h-full bg-red-400" style={{ width: staffPct + "%" }} />
                        </div>
                        {staffQty > 0 && (
                          <span className="text-xs font-semibold text-slate-400 shrink-0 flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-red-400 inline-block"></span>
                            staff stock ({staffQty})
                          </span>
                        )}
                        {staffQty === 0 && (
                          <span className="text-xs font-semibold text-slate-400 shrink-0 flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block"></span>
                            warehouse only
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex gap-3 pt-2">
                      <Button variant="secondary" className="flex-1 bg-slate-800 text-slate-200 hover:bg-slate-700 border-0" onClick={() => {}}>
                        View Product <ArrowUpRight className="w-3 h-3 ml-2 opacity-70" />
                      </Button>
                      <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => {
                        setSelectedProduct({ id: row.product_id, name: row.product_name, unit: row.unit });
                        setShowAdjust(true);
                      }}>
                        + Adjust Stock
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="mt-10 pt-6">
            <h2 className="text-lg font-semibold mb-1">Products Stock Flow</h2>
            <p className="text-sm text-muted-foreground mb-6">Recent product stock movements in the selected warehouse.</p>
            <div className="rounded-md border bg-card">
              <DataTable data={movements || []} columns={movementColumns} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="raw-materials">
          <div className="py-10 text-center">
            <h3 className="text-lg font-medium text-muted-foreground">Raw Materials coming soon</h3>
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Combined Adjust / Transfer Stock Dialog */}
      <Dialog open={showAdjust || showTransfer} onOpenChange={(open) => {
        if (!open) {
          setShowAdjust(false);
          setShowTransfer(false);
        }
      }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Inventory specific to {selectedProduct?.name || "Product"}</DialogTitle>
            <DialogDescription>
              Transfer or adjust stock quantities.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={showTransfer ? "transfer" : "adjust"} className="w-full mt-2" onValueChange={(val) => {
            if (val === "transfer") { setShowTransfer(true); setShowAdjust(false); }
            else { setShowAdjust(true); setShowTransfer(false); }
          }}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="transfer">Transfer Stock</TabsTrigger>
              <TabsTrigger value="adjust">Adjust Stock</TabsTrigger>
            </TabsList>
            
            <TabsContent value="adjust" className="space-y-4 outline-none">
              <form onSubmit={handleAdjust} className="space-y-4">
                <div className="space-y-2">
                  <Label>Movement Type</Label>
                  <Select value={adjustType} onValueChange={(v: any) => setAdjustType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(MOVEMENT_TYPES).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantity ({selectedProduct?.unit || "units"})</Label>      
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value)}
                    required
                  />
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {adjustType === "adjustment" ? "Use negative for reduction." : "Enter positive value, system will apply sign."}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Reason / Note</Label>
                  <Textarea
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="e.g. Broken stock, Received shipment #123"
                    className="resize-none"
                    rows={2}
                  />
                </div>
                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => { setShowAdjust(false); setShowTransfer(false); }}>Cancel</Button>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}   
                    Confirm Adjustment
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="transfer" className="space-y-3 outline-none">
              <form onSubmit={handleTransfer} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* From */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase">From</Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant={transferFrom === "warehouse" ? "default" : "outline"}
                        onClick={() => setTransferFrom("warehouse")}
                        className="flex-1 px-1 h-8 text-[11px]"
                        disabled={!isAdmin && transferTo === "warehouse"}
                      >
                        Warehouse
                      </Button>
                      <Button
                        type="button"
                        variant={transferFrom === "staff" ? "default" : "outline"}    
                        onClick={() => setTransferFrom("staff")}
                        className="flex-1 px-1 h-8 text-[11px]"
                        disabled={!isAdmin}
                      >
                        Staff
                      </Button>
                    </div>
                    {transferFrom === "staff" && (
                      <Select value={transferFromUserId} onValueChange={setTransferFromUserId} required>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select staff..." />
                        </SelectTrigger>
                        <SelectContent>
                          {staffMembers?.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* To */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase">To</Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant={transferTo === "warehouse" ? "default" : "outline"}  
                        onClick={() => setTransferTo("warehouse")}
                        className="flex-1 px-1 h-8 text-[11px]"
                        disabled={!isAdmin}
                      >
                        Warehouse
                      </Button>
                      <Button
                        type="button"
                        variant={transferTo === "staff" ? "default" : "outline"}      
                        onClick={() => setTransferTo("staff")}
                        className="flex-1 px-1 h-8 text-[11px]"
                      >
                        Staff
                      </Button>
                    </div>
                    {transferTo === "staff" && (
                      <Select value={transferToUserId} onValueChange={setTransferToUserId} required>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select staff..." />
                        </SelectTrigger>
                        <SelectContent>
                          {staffMembers
                            ?.filter((s) => s.id !== transferFromUserId)
                            ?.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <Label>Quantity ({selectedProduct?.unit || "units"})</Label>      
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Enter quantity"
                    value={transferQty}
                    onChange={(e) => setTransferQty(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Textarea
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    placeholder="Reason for transfer..."
                    className="resize-none"
                    rows={2}
                  />
                </div>

                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => { setShowAdjust(false); setShowTransfer(false); }}>Cancel</Button>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}   
                    Complete Transfer
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
`;
txt = txt.substring(0, renderStart) + newRender + '\n\nexport default Inventory;\n';
fs.writeFileSync(file, txt);
console.log('Update complete');
