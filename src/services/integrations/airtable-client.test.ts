import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  REMASTER_CANONICAL_SONG_ARTIST,
  REMASTER_CANONICAL_SONG_BRAND,
  REMASTER_SONG_READ_BRANDS,
  __setSupabaseClientForTests,
  createRecord,
  createSong,
  getSongById,
  getSongs,
  getSongsWithoutYouTube,
} from './airtable-client';

process.env.NODE_ENV = 'test';

type QueryCall = { method: string; args: unknown[] };

function songRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Test Song',
    artist: null,
    genre: null,
    mood: null,
    bpm: null,
    duration: null,
    file_url: 'https://example.test/audio.mp3',
    status: 'ready',
    youtube_url: null,
    youtube_channel_id: null,
    youtube_video_id: null,
    brand: REMASTER_CANONICAL_SONG_BRAND,
    tags: null,
    steps: null,
    style: null,
    energy: null,
    visual_style: null,
    image_url: null,
    thumbnail_url: null,
    ai_metadata: null,
    error_message: null,
    airtable_id: null,
    created_at: '2026-06-09T10:00:00.000Z',
    updated_at: '2026-06-09T10:00:00.000Z',
    ...overrides,
  };
}

class FakeQuery {
  calls: QueryCall[] = [];
  inserted: Record<string, unknown> | null = null;

  constructor(private rows: Record<string, unknown>[] = [songRow()]) {}

  select(...args: unknown[]) {
    this.calls.push({ method: 'select', args });
    return this;
  }

  insert(payload: Record<string, unknown>) {
    this.calls.push({ method: 'insert', args: [payload] });
    this.inserted = payload;
    return this;
  }

  in(...args: unknown[]) {
    this.calls.push({ method: 'in', args });
    return this;
  }

  is(...args: unknown[]) {
    this.calls.push({ method: 'is', args });
    return this;
  }

  eq(...args: unknown[]) {
    this.calls.push({ method: 'eq', args });
    return this;
  }

  order(...args: unknown[]) {
    this.calls.push({ method: 'order', args });
    return this;
  }

  limit(...args: unknown[]) {
    this.calls.push({ method: 'limit', args });
    return this;
  }

  single() {
    const row = this.inserted ? songRow(this.inserted) : this.rows[0];
    return Promise.resolve({ data: row, error: null });
  }

  then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve({ data: this.rows, error: null }).then(resolve, reject);
  }
}

function installFakeSupabase(rows?: Record<string, unknown>[]) {
  const query = new FakeQuery(rows);
  const client = {
    from(table: string) {
      assert.equal(table, 'songs');
      return query;
    },
  };
  __setSupabaseClientForTests(client as never);
  return query;
}

beforeEach(() => {
  __setSupabaseClientForTests(null);
});

test('createSong writes canonical Re-Master brand and artist by default', async () => {
  const query = installFakeSupabase();

  await createSong({
    title: 'Canonical Write',
    audioUrl: 'https://example.test/canonical.mp3',
    brand: 'other-brand',
  } as never);

  assert.equal(query.inserted?.brand, REMASTER_CANONICAL_SONG_BRAND);
  assert.equal(query.inserted?.artist, REMASTER_CANONICAL_SONG_ARTIST);
  assert.equal(query.inserted?.name, 'Canonical Write');
});

test('createRecord ignores arbitrary client brand input', async () => {
  const query = installFakeSupabase();

  await createRecord('songs', {
    title: 'Legacy Create',
    artist: undefined,
    audioUrl: 'https://example.test/legacy.mp3',
    brand: 'not-remaster',
  });

  assert.equal(query.inserted?.brand, REMASTER_CANONICAL_SONG_BRAND);
  assert.equal(query.inserted?.artist, REMASTER_CANONICAL_SONG_ARTIST);
});

test('getSongs keeps canonical and legacy Re-Master brand variants readable', async () => {
  const query = installFakeSupabase([
    songRow({ brand: REMASTER_CANONICAL_SONG_BRAND, name: 'Canonical' }),
    songRow({ brand: 'neural-beat', name: 'Legacy Hyphen', artist: 'Neural Beat' }),
    songRow({ brand: 'neuralbeat', name: 'Legacy Compact', artist: 'Neural Beat' }),
  ]);

  const songs = await getSongs();

  assert.deepEqual(
    query.calls.find((call) => call.method === 'in')?.args,
    ['brand', [...REMASTER_SONG_READ_BRANDS]],
  );
  assert.deepEqual(songs.map((song) => song.title), ['Canonical', 'Legacy Hyphen', 'Legacy Compact']);
  assert.equal(songs[0].artist, REMASTER_CANONICAL_SONG_ARTIST);
  assert.equal(songs[1].artist, 'Neural Beat');
});

test('pipeline queue reads only canonical and legacy Re-Master songs without YouTube URLs', async () => {
  const query = installFakeSupabase([songRow({ brand: 'neural-beat' })]);

  await getSongsWithoutYouTube();

  assert.deepEqual(
    query.calls.find((call) => call.method === 'in')?.args,
    ['brand', [...REMASTER_SONG_READ_BRANDS]],
  );
  assert.deepEqual(query.calls.find((call) => call.method === 'is')?.args, ['youtube_url', null]);
});

test('getSongById applies legacy-compatible Re-Master brand guard', async () => {
  const query = installFakeSupabase([songRow({ brand: 'neuralbeat' })]);

  await getSongById('11111111-1111-4111-8111-111111111111');

  assert.deepEqual(query.calls.find((call) => call.method === 'eq')?.args, [
    'id',
    '11111111-1111-4111-8111-111111111111',
  ]);
  assert.deepEqual(
    query.calls.find((call) => call.method === 'in')?.args,
    ['brand', [...REMASTER_SONG_READ_BRANDS]],
  );
});
