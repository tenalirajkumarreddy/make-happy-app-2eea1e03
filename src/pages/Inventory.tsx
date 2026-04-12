import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { 
  StaffStockView, 
  WarehouseStockView,
  ManagerReturnDashboard 
} from "@/components/inventory";
import Products from "./Products";
import RawMaterials from "./RawMaterials";
import { 
  Package, 
  Warehouse, 
  Users, 
  Boxes, 
  ArrowRightLeft,
  RefreshCw
} from "lucide-react";
import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMyReturns } from "@/hooks/inventory";

export default function Inventory() {
  const { user, role } = useAuth();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<string>("my-stock");
  const [canManageWarehouse, setCanManageWarehouse] = useState(false);
  const [canViewMyStock, setCanViewMyStock] = useState(false);
  const [canManageProducts, setCanManageProducts] = useState(false);

  // Get return count for badge
  const { returns: myReturns } = useMyReturns("pending");

  useEffect(() => {
    const isManager = role === "super_admin" || role === "manager";
    const isStaff = role === "agent" || role === "marketer";
    
    setCanManageWarehouse(isManager);
    setCanManageProducts(isManager);
    setCanViewMyStock(isStaff || isManager);
    
    // Set default tab based on role
    if (isManager && !isStaff) {
      setActiveTab("warehouse");
    } else if (isStaff) {
      setActiveTab("my-stock");
    }
  }, [role]);

  // Determine which tabs to show
  const showMyStock = canViewMyStock;
  const showWarehouse = canManageWarehouse;
  const showProducts = canManageProducts;
  const showRawMaterials = canManageProducts;
  const showReturns = canManageWarehouse; // Managers see return dashboard

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Inventory Management"
        description="Manage stock, products, and raw materials"
        icon={<Boxes className="h-6 w-6" />}
      />

      <div className="p-4 sm:p-6 lg:p-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex flex-wrap gap-2 bg-muted/50 p-1 rounded-lg">
            {showMyStock && (
              <TabsTrigger 
                value="my-stock" 
                className="flex items-center gap-2 px-4 py-2"
              >
                <Users className="h-4 w-4" />
                <span className={isMobile ? "hidden sm:inline" : ""}>My Stock</span>
              </TabsTrigger>
            )}
            
            {showWarehouse && (
              <TabsTrigger 
                value="warehouse" 
                className="flex items-center gap-2 px-4 py-2"
              >
                <Warehouse className="h-4 w-4" />
                <span className={isMobile ? "hidden sm:inline" : ""}>Warehouse</span>
              </TabsTrigger>
            )}
            
            {showReturns && (
              <TabsTrigger 
                value="returns" 
                className="flex items-center gap-2 px-4 py-2"
              >
                <ArrowRightLeft className="h-4 w-4" />
                <span className={isMobile ? "hidden sm:inline" : ""}>Returns</span>
                {myReturns && myReturns.length > 0 && (
                  <span className="ml-1 bg-amber-500 text-white text-xs rounded-full px-2 py-0.5">
                    {myReturns.length}
                  </span>
                )}
              </TabsTrigger>
            )}
            
            {showProducts && (
              <TabsTrigger 
                value="products" 
                className="flex items-center gap-2 px-4 py-2"
              >
                <Package className="h-4 w-4" />
                <span className={isMobile ? "hidden sm:inline" : ""}>Products</span>
              </TabsTrigger>
            )}
            
            {showRawMaterials && (
              <TabsTrigger 
                value="raw-materials" 
                className="flex items-center gap-2 px-4 py-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span className={isMobile ? "hidden sm:inline" : ""}>Raw Materials</span>
              </TabsTrigger>
            )}
          </TabsList>

          {/* My Stock Tab */}
          {showMyStock && (
            <TabsContent value="my-stock" className="space-y-4">
              <StaffStockView canEdit={canViewMyStock} />
            </TabsContent>
          )}

          {/* Warehouse Tab */}
          {showWarehouse && (
            <TabsContent value="warehouse" className="space-y-4">
              <WarehouseStockView canManage={canManageWarehouse} />
            </TabsContent>
          )}

          {/* Returns Tab */}
          {showReturns && (
            <TabsContent value="returns" className="space-y-4">
              <ManagerReturnDashboard />
            </TabsContent>
          )}

          {/* Products Tab */}
          {showProducts && (
            <TabsContent value="products" className="space-y-4">
              <Card>
                <CardContent className="p-0">
                  <div className="p-4 border-b bg-muted/30">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Package className="h-5 w-5 text-blue-600" />
                      Products Catalog
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Manage product catalog with pricing, categories, and inventory settings
                    </p>
                  </div>
                  <div className="p-4">
                    <Products />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Raw Materials Tab */}
          {showRawMaterials && (
            <TabsContent value="raw-materials" className="space-y-4">
              <Card>
                <CardContent className="p-0">
                  <div className="p-4 border-b bg-muted/30">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <RefreshCw className="h-5 w-5 text-amber-600" />
                      Raw Materials
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Manage raw materials with vendor associations and purchase tracking
                    </p>
                  </div>
                  <div className="p-4">
                    <RawMaterials />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
