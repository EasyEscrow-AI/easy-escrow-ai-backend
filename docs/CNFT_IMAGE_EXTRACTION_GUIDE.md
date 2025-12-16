# cNFT Image Extraction Guide

This guide explains how to properly extract and display images for Compressed NFTs (cNFTs) on Solana, including handling JSON metadata files.

## Problem

cNFTs store image URLs in various locations:
1. **Direct in DAS API response**: `content.files[0].uri`, `content.links.image`, `content.metadata.image`
2. **In JSON metadata files**: The DAS API provides a `json_uri` that points to a JSON file containing the image URL

Many cNFTs (like POPS #856) store their image URL in JSON metadata files rather than directly in the DAS API response. Simply using `json_uri` as the image URL won't work - you need to fetch the JSON and extract the `image` field.

## Solution

### Step 1: Check Direct Image URLs First

Always check for direct image URLs in the DAS API response first:

```typescript
let imageUrl = asset.content?.files?.[0]?.uri || 
              asset.content?.links?.image || 
              asset.content?.metadata?.image ||
              null;
```

### Step 2: Fetch JSON Metadata if No Direct URL

If no direct image URL is found, fetch the JSON metadata:

```typescript
// If no direct image URL, try fetching from JSON metadata
if (!imageUrl && (asset.content?.json_uri || asset.content?.metadata?.uri || asset.uri)) {
  const jsonUri = asset.content?.json_uri || asset.content?.metadata?.uri || asset.uri;
  try {
    // Fetch JSON metadata and extract image field
    const metadataResponse = await fetch(jsonUri, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    
    if (metadataResponse.ok) {
      const metadata = await metadataResponse.json() as any;
      // Extract image from JSON metadata (standard NFT metadata format)
      imageUrl = metadata.image || 
                metadata.properties?.files?.[0]?.uri ||
                metadata.properties?.image ||
                null;
    }
  } catch (error: any) {
    // Silently fail - we'll use fallback
    console.warn(`Failed to fetch JSON metadata from ${jsonUri}:`, error.message);
  }
}
```

### Step 3: Final Fallback

If still no image URL, use the URI as a final fallback:

```typescript
// Final fallback to URI if still no image
if (!imageUrl) {
  imageUrl = asset.uri || null;
}
```

## Complete Implementation Example

Here's a complete example for mapping cNFTs with proper image extraction:

```typescript
// Map cNFTs to your format
const mappedCNfts = await Promise.all(filteredCNfts.map(async (asset: any) => {
  // Step 1: Try direct image URLs from DAS API
  let imageUrl = asset.content?.files?.[0]?.uri || 
                asset.content?.links?.image || 
                asset.content?.metadata?.image ||
                null;
  
  // Step 2: Fetch JSON metadata if no direct URL
  if (!imageUrl && (asset.content?.json_uri || asset.content?.metadata?.uri || asset.uri)) {
    const jsonUri = asset.content?.json_uri || asset.content?.metadata?.uri || asset.uri;
    try {
      const metadataResponse = await fetch(jsonUri, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      
      if (metadataResponse.ok) {
        const metadata = await metadataResponse.json() as any;
        imageUrl = metadata.image || 
                  metadata.properties?.files?.[0]?.uri ||
                  metadata.properties?.image ||
                  null;
      }
    } catch (error: any) {
      // Handle error gracefully
      console.warn(`Failed to fetch JSON metadata:`, error.message);
    }
  }
  
  // Step 3: Final fallback
  if (!imageUrl) {
    imageUrl = asset.uri || null;
  }
  
  return {
    mint: asset.id,
    name: asset.content?.metadata?.name || 'Unknown cNFT',
    image: imageUrl,
    // ... other fields
  };
}));
```

## JSON Metadata Format

The JSON metadata typically follows the Metaplex NFT standard:

```json
{
  "name": "POPS #856",
  "symbol": "POPS",
  "description": "Pop is coming into the degen NFT world",
  "image": "https://ap-assets.pinit.io/6CDm4SCc6BqUSQUV12E5v8qgJY7NatdoyttZp8fqGNwY/92004de8-2665-40f9-a743-615fc508e07c/856",
  "properties": {
    "files": [
      {
        "uri": "https://ap-assets.pinit.io/...",
        "type": "image/jpeg"
      }
    ],
    "category": "image"
  }
}
```

### Image Field Priority

When extracting from JSON metadata, check in this order:
1. `metadata.image` - Primary image field
2. `metadata.properties.files[0].uri` - First file URI
3. `metadata.properties.image` - Alternative image field

## Frontend Image Loading

For better image loading in the browser, add these attributes:

```html
<img 
  src="${imageUrl}" 
  alt="${nft.name}"
  loading="lazy"
  crossorigin="anonymous"
  referrerpolicy="no-referrer">
```

### Attributes Explained

- **`loading="lazy"`**: Defers image loading until needed (performance)
- **`crossorigin="anonymous"`**: Enables CORS for cross-origin images
- **`referrerpolicy="no-referrer"`**: Prevents sending referrer header (privacy)

## Error Handling

Always handle JSON fetch failures gracefully:

```typescript
try {
  const metadataResponse = await fetch(jsonUri, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  // ... extract image
} catch (error: any) {
  // Don't throw - use fallback instead
  console.warn(`Failed to fetch JSON metadata:`, error.message);
  // Continue with fallback image or placeholder
}
```

## Common Issues

### Issue 1: Images Not Loading from JSON Metadata

**Symptom**: cNFT images show placeholders even though JSON metadata contains image URL.

**Solution**: Make sure you're fetching the JSON and extracting the `image` field, not using `json_uri` directly as the image URL.

### Issue 2: CORS Errors

**Symptom**: Browser console shows CORS errors when loading images.

**Solution**: Add `crossorigin="anonymous"` attribute to `<img>` tags.

### Issue 3: Timeout Errors

**Symptom**: JSON metadata fetch times out.

**Solution**: Use `AbortSignal.timeout(5000)` to limit fetch time and handle gracefully.

## Testing

To test your implementation:

1. **Find a cNFT with JSON metadata**: Use Helius Orb or similar tool to find cNFTs
2. **Check the JSON URI**: Verify the `json_uri` field in DAS API response
3. **Fetch the JSON**: Manually fetch the JSON to see the structure
4. **Test extraction**: Verify your code extracts the image URL correctly

## Example: POPS #856

- **cNFT ID**: `22twHmkNEUiLCwLEvk7csxnQBQMgnw1g5ULaGZJrXvAi`
- **JSON URI**: `https://gateway.pinit.io/ipfs/QmZ43SF8hHSA1iwdf8ue6ZanzLZv3vuo9Agus5MrysozQk/856.json`
- **Image URL in JSON**: `https://ap-assets.pinit.io/6CDm4SCc6BqUSQUV12E5v8qgJY7NatdoyttZp8fqGNwY/92004de8-2665-40f9-a743-615fc508e07c/856`

## Related Files

- `src/routes/test.routes.ts` - Backend implementation
- `src/public/js/test-page.js` - Frontend image display

## References

- [Metaplex NFT Standard](https://docs.metaplex.com/programs/token-metadata/token-standard)
- [Helius DAS API Documentation](https://docs.helius.dev/compression-and-das-api/digital-asset-standard-das-api)
- [Solana cNFT Specification](https://docs.solana.com/developing/programming-model/accounts#compressed-nfts)

