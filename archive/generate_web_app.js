const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const outputFile = path.join(rootDir, 'web_app_code.txt');

// Directories to ignore (not web app related or generated files)
const ignoreDirs = ['.git', 'node_modules', 'dist', 'build', 'android', 'supabase', 'scripts', 'Open-SMS', 'wireframes', 'docs', 'attached_assets', '.github', 'assets', 'public'];
// Extensions to include
const includeExts = ['.ts', '.tsx', '.js', '.jsx', '.css', '.html'];
// Specific root files to include
const rootFiles = ['index.html', 'package.json', 'vite.config.ts', 'tailwind.config.ts'];

let output = 'Directory Structure:\n====================\n';

function generateTree(dir, prefix = '') {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
         if (!ignoreDirs.includes(file)) {
            output += `${prefix}${file}/\n`;
            generateTree(filePath, prefix + '  ');
         }
      } else {
         if (includeExts.includes(path.extname(file)) || rootFiles.includes(file)) {
             output += `${prefix}${file}\n`;
         }
      }
    }
  } catch(e) {}
}

// 1. Generate Tree for src and root files
generateTree(path.join(rootDir, 'src'), 'src/');
rootFiles.forEach(file => {
    if (fs.existsSync(path.join(rootDir, file))) {
        output += `${file}\n`;
    }
});

output += '\n\nFiles Content:\n==============\n';

function writeContent(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        if (!ignoreDirs.includes(file)) {
          writeContent(filePath);
        }
      } else {
        if (includeExts.includes(path.extname(file))) {
           const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
           output += `\n${relativePath}\n<content>\n${fs.readFileSync(filePath, 'utf-8')}\n</content>\n`;
        }
      }
    }
  } catch(e) {}
}

// 2. Read contents of src folder
writeContent(path.join(rootDir, 'src'));

// 3. Read contents of root files
for (const file of rootFiles) {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
        output += `\n${file}\n<content>\n${fs.readFileSync(filePath, 'utf-8')}\n</content>\n`;
    }
}

fs.writeFileSync(outputFile, output);
console.log('Successfully generated web_app_code.txt!');