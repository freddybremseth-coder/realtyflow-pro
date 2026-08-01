# Verification

After deployment:

1. Open `/api/media/assets?limit=60` and confirm HTTP 200 with existing rows.
2. Open `/api/media/projects` and confirm HTTP 200 with auto-created projects.
3. Open AI Media Studio → Library and confirm generated images render.
4. Open AI Media Studio → Projects and confirm projects render.
5. Generate one new Gemini image and verify it appears in Library without a page reload after pressing Refresh.
