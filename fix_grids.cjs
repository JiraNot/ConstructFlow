const fs = require('fs');

function fixComponent(filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  code = code.replace(/gridTemplateColumns:\s*["']1fr 1fr 1fr["']/g, 'gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))"');
  code = code.replace(/gridTemplateColumns:\s*["']1fr 1fr["']/g, 'gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"');
  code = code.replace(/gridTemplateColumns:\s*["']1fr 1fr 1fr 1\.5fr["']/g, 'gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))"');
  
  code = code.replace(/background:\s*["']#ffffff["'],\s*border:\s*["']1px solid #53657b["'],\s*color:\s*["']#fff["']/g, 'background: "#ffffff", border: "1px solid #ccd9e5", color: "#24364b"');

  if (code !== fs.readFileSync(filePath, 'utf8')) {
    fs.writeFileSync(filePath, code);
    console.log("Fixed " + filePath);
  }
}

fixComponent('D:/APP/ConstructFlow/apps/plan-editor/src/components/ProjectLegalModal.tsx');
fixComponent('D:/APP/ConstructFlow/apps/plan-editor/src/components/ExtensionPresetsModal.tsx');
fixComponent('D:/APP/ConstructFlow/apps/plan-editor/src/components/SyncBridgePanel.tsx');
