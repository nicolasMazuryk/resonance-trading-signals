#!/usr/bin/env ts-node

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRESERVE_FILE = 'historical-messages.json';

function cleanupData() {
  try {
    // Check if data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      console.log('Data directory does not exist. Nothing to clean up.');
      return;
    }

    // Read all files in the data directory
    const files = fs.readdirSync(DATA_DIR);
    
    let removedCount = 0;
    let preservedCount = 0;

    for (const file of files) {
      const filePath = path.join(DATA_DIR, file);
      const stats = fs.statSync(filePath);

      if (stats.isFile()) {
        if (file === PRESERVE_FILE) {
          console.log(`✅ Preserving: ${file}`);
          preservedCount++;
        } else {
          fs.unlinkSync(filePath);
          console.log(`🗑️  Removed: ${file}`);
          removedCount++;
        }
      } else if (stats.isDirectory()) {
        // Remove directories recursively
        fs.rmSync(filePath, { recursive: true, force: true });
        console.log(`🗑️  Removed directory: ${file}`);
        removedCount++;
      }
    }

    console.log('\n📊 Cleanup Summary:');
    console.log(`   Files removed: ${removedCount}`);
    console.log(`   Files preserved: ${preservedCount}`);
    console.log(`   Total files processed: ${files.length}`);
    
    if (removedCount > 0) {
      console.log('\n✅ Data cleanup completed successfully!');
    } else {
      console.log('\nℹ️  No files were removed. Data directory is already clean.');
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupData();
