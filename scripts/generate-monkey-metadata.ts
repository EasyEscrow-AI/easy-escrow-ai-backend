/**
 * Generate Monkey NFT Metadata JSON Files
 * 
 * Creates proper Solana NFT metadata JSON files with monkey images
 * from public sources (Unsplash, placeholder services, etc.)
 */

import * as fs from 'fs';
import * as path from 'path';

interface MonkeyMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string }>;
  properties: {
    files: Array<{ uri: string; type: string }>;
    category: string;
  };
}

const monkeyCollection = [
  // Maker Monkeys
  {
    name: 'Capuchin Monkey',
    description: 'A clever and resourceful capuchin monkey from the rainforests of Central and South America.',
    image: 'https://images.unsplash.com/photo-1540573133985-87b6da6d54a9?w=800',
    attributes: [
      { trait_type: 'Species', value: 'Capuchin' },
      { trait_type: 'Habitat', value: 'Rainforest' },
      { trait_type: 'Rarity', value: 'Common' },
      { trait_type: 'Intelligence', value: 'High' },
    ],
  },
  {
    name: 'Howler Monkey',
    description: 'Known for their powerful howls that can be heard for miles through the jungle.',
    image: 'https://images.unsplash.com/photo-1615963244664-5b845b2025ee?w=800',
    attributes: [
      { trait_type: 'Species', value: 'Howler' },
      { trait_type: 'Habitat', value: 'Tropical Forest' },
      { trait_type: 'Rarity', value: 'Uncommon' },
      { trait_type: 'Volume', value: 'Very Loud' },
    ],
  },
  {
    name: 'Spider Monkey',
    description: 'Agile acrobats with prehensile tails that act as a fifth limb.',
    image: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=800',
    attributes: [
      { trait_type: 'Species', value: 'Spider' },
      { trait_type: 'Habitat', value: 'Canopy' },
      { trait_type: 'Rarity', value: 'Rare' },
      { trait_type: 'Agility', value: 'Extreme' },
    ],
  },
  {
    name: 'Macaque Monkey',
    description: 'Highly intelligent and social primates found across Asia.',
    image: 'https://images.unsplash.com/photo-1540206063137-4a88ca974d1a?w=800',
    attributes: [
      { trait_type: 'Species', value: 'Macaque' },
      { trait_type: 'Habitat', value: 'Mountains & Forests' },
      { trait_type: 'Rarity', value: 'Common' },
      { trait_type: 'Social', value: 'High' },
    ],
  },
  // Taker Monkeys
  {
    name: 'Baboon Monkey',
    description: 'Powerful and intelligent primates with distinctive faces and complex social structures.',
    image: 'https://images.unsplash.com/photo-1606420961485-41ea039093b7?w=800',
    attributes: [
      { trait_type: 'Species', value: 'Baboon' },
      { trait_type: 'Habitat', value: 'Savanna' },
      { trait_type: 'Rarity', value: 'Uncommon' },
      { trait_type: 'Strength', value: 'High' },
    ],
  },
  {
    name: 'Mandrill Monkey',
    description: 'The most colorful of all primates, with vibrant red and blue faces.',
    image: 'https://images.unsplash.com/photo-1501706362039-c06b2d715385?w=800',
    attributes: [
      { trait_type: 'Species', value: 'Mandrill' },
      { trait_type: 'Habitat', value: 'Rainforest' },
      { trait_type: 'Rarity', value: 'Epic' },
      { trait_type: 'Color', value: 'Vibrant' },
    ],
  },
  {
    name: 'Tamarin Monkey',
    description: 'Tiny, energetic monkeys with distinctive mustaches and colorful fur.',
    image: 'https://images.unsplash.com/photo-1564349683136-77e08dba1ef7?w=800',
    attributes: [
      { trait_type: 'Species', value: 'Tamarin' },
      { trait_type: 'Habitat', value: 'Amazon' },
      { trait_type: 'Rarity', value: 'Rare' },
      { trait_type: 'Size', value: 'Tiny' },
    ],
  },
  {
    name: 'Marmoset Monkey',
    description: 'The smallest monkeys in the world, incredibly agile and social.',
    image: 'https://images.unsplash.com/photo-1580110533026-d5fc7eb6f93b?w=800',
    attributes: [
      { trait_type: 'Species', value: 'Marmoset' },
      { trait_type: 'Habitat', value: 'Forest' },
      { trait_type: 'Rarity', value: 'Legendary' },
      { trait_type: 'Cuteness', value: 'Maximum' },
    ],
  },
];

async function generateMetadata() {
  console.log('🐵 Generating Monkey NFT Metadata...\n');

  const outputDir = path.join(__dirname, '../temp/monkey-metadata');
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const metadataFiles: Array<{ name: string; file: string; uri: string }> = [];

  for (let i = 0; i < monkeyCollection.length; i++) {
    const monkey = monkeyCollection[i];
    const filename = `monkey-${i + 1}.json`;
    const filepath = path.join(outputDir, filename);

    const metadata: MonkeyMetadata = {
      name: monkey.name,
      symbol: 'MONKEY',
      description: monkey.description,
      image: monkey.image,
      attributes: monkey.attributes,
      properties: {
        files: [
          {
            uri: monkey.image,
            type: 'image/jpeg',
          },
        ],
        category: 'image',
      },
    };

    fs.writeFileSync(filepath, JSON.stringify(metadata, null, 2));
    
    console.log(`✅ Generated: ${filename}`);
    console.log(`   Name: ${monkey.name}`);
    console.log(`   Image: ${monkey.image}`);

    metadataFiles.push({
      name: monkey.name,
      file: filename,
      uri: `FILE://${filepath}`, // Placeholder - will be uploaded to IPFS/Arweave
    });
  }

  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log(`✅ Generated ${metadataFiles.length} metadata files in: ${outputDir}`);
  console.log('\n📝 Next Steps:');
  console.log('   1. Upload these JSON files to IPFS, Arweave, or Shadow Drive');
  console.log('   2. Update setup-dedicated-test-trees.ts with the uploaded URIs');
  console.log('   3. Run setup script to mint cNFTs with proper metadata\n');

  // Generate TypeScript snippet for setup script
  const tsSnippet = `
// Copy this into setup-dedicated-test-trees.ts:

const makerMonkeys = [
  { name: '${monkeyCollection[0].name}', uri: 'UPLOAD_URI_HERE' },
  { name: '${monkeyCollection[1].name}', uri: 'UPLOAD_URI_HERE' },
  { name: '${monkeyCollection[2].name}', uri: 'UPLOAD_URI_HERE' },
  { name: '${monkeyCollection[3].name}', uri: 'UPLOAD_URI_HERE' },
];

const takerMonkeys = [
  { name: '${monkeyCollection[4].name}', uri: 'UPLOAD_URI_HERE' },
  { name: '${monkeyCollection[5].name}', uri: 'UPLOAD_URI_HERE' },
  { name: '${monkeyCollection[6].name}', uri: 'UPLOAD_URI_HERE' },
  { name: '${monkeyCollection[7].name}', uri: 'UPLOAD_URI_HERE' },
];
`.trim();

  fs.writeFileSync(
    path.join(outputDir, 'snippet.ts'),
    tsSnippet
  );

  console.log('💾 Saved TypeScript snippet to: temp/monkey-metadata/snippet.ts\n');
}

generateMetadata()
  .then(() => {
    console.log('✅ Metadata generation complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

