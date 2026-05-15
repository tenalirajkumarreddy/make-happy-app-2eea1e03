const fs = require('fs');
const path = require('path');

const dirs = [
  'src/mobile-v2/styles',
  'src/mobile-v2/components/ui',
  'src/mobile-v2/pages/admin',
  'src/mobile-v2/pages/agent',
  'src/mobile-v2/pages/customer',
  'src/mobile-v2/pages/marketer',
  'src/mobile-v2/pages/pos'
];

dirs.forEach(d => {
  fs.mkdirSync(d, { recursive: true });
  console.log(`Created: ${d}`);
});

console.log('All directories created successfully');
