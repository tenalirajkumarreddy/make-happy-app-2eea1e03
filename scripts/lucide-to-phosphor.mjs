import fs from 'fs';
import path from 'path';

const LUCIDE_TO_PHOSPHOR = {
  // Direct mappings (same name)
  'AlertCircle': 'WarningCircle',
  'AlertOctagon': 'WarningOctagon',
  'AlertTriangle': 'Warning',
  'Archive': 'ArchiveBox',
  'ArrowDown': 'ArrowDown',
  'ArrowDownLeft': 'ArrowDownLeft',
  'ArrowDownRight': 'ArrowDownRight',
  'ArrowDownToLine': 'ArrowDown',
  'ArrowLeft': 'ArrowLeft',
  'ArrowLeftRight': 'ArrowsLeftRight',
  'ArrowRight': 'ArrowRight',
  'ArrowRightLeft': 'ArrowsHorizontal',
  'ArrowUp': 'ArrowUp',
  'ArrowUpDown': 'ArrowsVertical',
  'ArrowUpFromLine': 'ArrowUp',
  'ArrowUpRight': 'ArrowUpRight',
  'ArrowUpToLine': 'ArrowUp',
  'Ban': 'CircleSlash',
  'Banknote': 'CurrencyCircleDollar',
  'BarChart2': 'ChartBar',
  'BarChart3': 'ChartBarHorizontal',
  'Bell': 'Bell',
  'Box': 'Package',
  'Boxes': 'Packages',
  'Building2': 'Building',
  'Calendar': 'Calendar',
  'CalendarIcon': 'Calendar',
  'Camera': 'Camera',
  'Check': 'Check',
  'CheckCheck': 'Check',
  'CheckCircle': 'CheckCircle',
  'CheckCircle2': 'CheckCircle',
  'CheckSquare': 'CheckSquare',
  'ChevronDown': 'CaretDown',
  'ChevronLeft': 'CaretLeft',
  'ChevronRight': 'CaretRight',
  'ChevronUp': 'CaretUp',
  'Circle': 'Circle',
  'CircleDot': 'Circle',
  'ClipboardList': 'ClipboardText',
  'Clock': 'Clock',
  'Cloud': 'Cloud',
  'CloudOff': 'CloudSlash',
  'Contact': 'User',
  'Copy': 'Copy',
  'CreditCard': 'CreditCard',
  'DollarSign': 'CurrencyDollar',
  'Dot': 'Circle',
  'Download': 'Download',
  'Edit': 'Pencil',
  'Edit2': 'Pencil',
  'ExternalLink': 'ArrowTopRightOnSquare',
  'Eye': 'Eye',
  'Factory': 'Factory',
  'FileCheck': 'FileCheck',
  'FileSpreadsheet': 'FileExcel',
  'FileText': 'FileText',
  'Filter': 'Funnel',
  'Globe': 'Globe',
  'Grid3X3': 'GridFour',
  'GripVertical': 'DragHandle',
  'HandCoins': 'HandCoins',
  'History': 'ClockCounterClockwise',
  'Home': 'House',
  'Image': 'Image',
  'ImageIcon': 'Image',
  'IndianRupee': 'CurrencyCircleDollar',
  'Info': 'Info',
  'Layers': 'Layers',
  'Link': 'Link',
  'LinkIcon': 'Link',
  'Link2': 'Link',
  'Loader2': 'Spinner',
  'Lock': 'Lock',
  'LogOut': 'SignOut',
  'Mail': 'Envelope',
  'Map': 'Map',
  'MapPin': 'MapPin',
  'Menu': 'List',
  'MessageCircle': 'ChatCircle',
  'Minus': 'Minus',
  'Moon': 'Moon',
  'MoreHorizontal': 'DotsThreeHorizontal',
  'MoreVertical': 'DotsThreeVertical',
  'Move': 'Move',
  'Navigation': 'NavigationArrow',
  'Navigation2': 'NavigationArrow',
  'Package': 'Package',
  'PackageMinus': 'Package',
  'PackageOpen': 'PackageOpen',
  'PackagePlus': 'Package',
  'PackageX': 'Package',
  'PanelLeft': 'SidebarSimple',
  'Pencil': 'Pencil',
  'PencilLine': 'Pencil',
  'Percent': 'Percent',
  'Phone': 'Phone',
  'PiggyBank': 'PiggyBank',
  'Play': 'PlayCircle',
  'Plus': 'Plus',
  'Printer': 'Printer',
  'QrCode': 'QrCode',
  'Receipt': 'Receipt',
  'ReceiptIndianRupee': 'Receipt',
  'RefreshCw': 'ArrowClockwise',
  'RotateCcw': 'ArrowCounterClockwise',
  'Route': 'MapPinLine',
  'Save': 'FloppyDisk',
  'ScanLine': 'QrCode',
  'Search': 'MagnifyingGlass',
  'Send': 'PaperPlane',
  'Settings': 'Gear',
  'Settings2': 'GearSix',
  'Share2': 'Share',
  'Shield': 'Shield',
  'ShieldAlert': 'ShieldWarning',
  'ShieldCheck': 'ShieldCheck',
  'ShoppingBag': 'ShoppingBag',
  'ShoppingCart': 'Cart',
  'Cart': 'Cart',
  'Smartphone': 'DeviceMobile',
  'SmartphoneIcon': 'DeviceMobile',
  'Square': 'Square',
  'Star': 'Star',
  'Store': 'Storefront',
  'StoreIcon': 'Storefront',
  'Sun': 'Sun',
  'Tag': 'Tag',
  'Tags': 'Tags',
  'Target': 'Target',
  'Trash2': 'Trash',
  'TrendingDown': 'ChartLineDown',
  'TrendingUp': 'ChartLineUp',
  'Truck': 'Truck',
  'Undo2': 'ArrowCounterClockwise',
  'Unlock': 'Unlock',
  'Upload': 'Upload',
  'User': 'User',
  'UserCheck': 'UserCheck',
  'UserCircle': 'UserCircle',
  'UserCircle2': 'UserCircle',
  'UserPlus': 'UserPlus',
  'Users': 'Users',
  'UserX': 'UserX',
  'Wallet': 'Wallet',
  'Warehouse': 'Warehouse',
  'WarehouseIcon': 'Warehouse',
  'Wifi': 'WifiHigh',
  'WifiOff': 'WifiSlash',
  'X': 'X',
  'XCircle': 'XCircle',
  'ZoomIn': 'MagnifyingGlassPlus',
  'ZoomOut': 'MagnifyingGlassMinus',
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  // Replace import statements
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/g;
  content = content.replace(importRegex, (match, imports) => {
    const icons = imports.split(',').map(i => i.trim());
    const newImports = icons.map(icon => {
      const name = icon.split(' as ')[0].trim();
      const alias = icon.includes(' as ') ? icon.split(' as ')[1].trim() : null;
      const phosphorName = LUCIDE_TO_PHOSPHOR[name];
      if (!phosphorName) return icon; // Keep as-is if no mapping
      return alias ? `${phosphorName} as ${alias}` : phosphorName;
    });
    changed = true;
    return `import { ${newImports.join(', ')} } from "@phosphor-icons/react"`;
  });

  // Replace component usage (e.g., <AlertCircle /> -> <WarningCircle />)
  Object.entries(LUCIDE_TO_PHOSPHOR).forEach(([lucide, phosphor]) => {
    const regex = new RegExp(`<${lucide}([^/>]*)/?>`, 'g');
    content = content.replace(regex, `<${phosphor}$1 />`);
    const closingRegex = new RegExp(`</${lucide}>`, 'g');
    content = content.replace(closingRegex, `</${phosphor}>`);
  });

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules') {
        walkDir(fullPath);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

walkDir(path.join(process.cwd(), 'src'));
console.log('Done!');