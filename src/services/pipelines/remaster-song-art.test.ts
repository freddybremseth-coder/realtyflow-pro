import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artCreditsDescription, classifyArtVisualMode, selectSongArtworks } from './remaster-song-art';

const artworks = [
  { id: 'quiet-coastal-horizon', title_en: 'Quiet Coastal Horizon', style_id: 'landscape', collection_id: 'mediterranean-soul', published: true, public_preview_path: 'quiet-coastal-horizon/view.webp', public_thumb_path: 'quiet-coastal-horizon/thumb.webp', pixel_width: 1122, pixel_height: 1402 },
  { id: 'moon-garden', title_en: 'Moon Garden', style_id: 'surrealism', collection_id: 'dreams', published: true, public_preview_path: 'moon-garden/view.webp', public_thumb_path: 'moon-garden/thumb.webp' },
  { id: 'blue-flowers', title_en: 'Blue Flowers', style_id: 'impressionism', collection_id: 'earth-and-emotion', published: true, public_preview_path: 'blue-flowers/view.webp', public_thumb_path: 'blue-flowers/thumb.webp' },
  { id: 'red-graffiti', title_en: 'Red Graffiti', style_id: 'street-art', collection_id: 'urban', published: true, public_preview_path: 'red-graffiti/view.webp', public_thumb_path: 'red-graffiti/thumb.webp' },
  { id: 'hidden-art', title_en: 'Hidden Art', style_id: 'landscape', published: false, public_preview_path: 'hidden-art/view.webp', public_thumb_path: 'hidden-art/thumb.webp' },
  { id: 'private-master', title_en: 'Private Master', style_id: 'landscape', published: true, public_preview_path: '../art-originals/master.png', public_thumb_path: '../art-originals/master.png' },
];

test('routes meditation, relaxing and alternative to art; leaves EDM untouched', () => {
  assert.equal(classifyArtVisualMode({ genre: 'Meditation' }), 'meditation');
  assert.equal(classifyArtVisualMode({ metadata: { category: 'relaxing' } }), 'relaxing');
  assert.equal(classifyArtVisualMode({ genre: 'Alternative Rock' }), 'alternative');
  assert.equal(classifyArtVisualMode({ genre: 'EDM', mood: 'energetic', metadata: { energy: 'high' } }), null);
  assert.equal(classifyArtVisualMode({ genre: 'House' }, { genre: 'ambient', mood: 'relaxing' }), 'relaxing');
});

test('selects only published public previews in an appropriate mood lane', () => {
  const result = selectSongArtworks(artworks, 'song-1', 'meditation', path => 'https://supabase.test/storage/v1/object/public/art-previews/' + path);
  assert.equal(result.length, 3);
  assert.ok(result.every(item => item.imageUrl.includes('/art-previews/') && item.imageUrl.endsWith('/view.webp')));
  assert.ok(!result.some(item => item.id === 'private-master' || item.id === 'hidden-art' || item.id === 'red-graffiti'));
  assert.deepEqual(result.map(item => item.id), selectSongArtworks(artworks, 'song-1', 'meditation', path => path).map(item => item.id));
});

test('credits both creator brands and the individual song gallery', () => {
  const description = artCreditsDescription('00000000-0000-4000-8000-000000000001');
  assert.match(description, /art\.freddybremseth\.com/);
  assert.match(description, /remaster\.freddybremseth\.com\/gallery\/00000000-0000-4000-8000-000000000001/);
  assert.match(description, /Music by Re-Master Freddy/);
});
