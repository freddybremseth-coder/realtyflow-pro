-- Freddy-owned creative brand architecture: the umbrella is a person,
-- Art, Re-Master and Publishing own independent catalogs and channel identities.
-- No OAuth, external channel or auto-publishing grant is fabricated here.
insert into public.brand_context
(brand_id,brand_name,voice,audience,languages,markets,services,value_proposition,
 allowed_claims,forbidden_claims,preferred_cta,visual_direction,urls,contact,updated_at)
values
('freddyart','Freddy Bremseth Art',
 'Gallery-first, expressive, original and visually led. Explain the artwork; music supports the visual story.',
 'People interested in original contemporary art, collections, artwork details and the Art Lounge pairing of art and music.',
 '["en","no"]'::jsonb,'["online","Spain","international"]'::jsonb,
 '["original artworks","art gallery","Art Lounge Reels","art discovery"]'::jsonb,
 'Original art and collections by Freddy Bremseth, presented as artwork first and paired with authorized Re-Master Freddy music.',
 '["Only published public art previews from art_gallery_works are social-safe.","Credit the actual artwork and original authorized soundtrack."]'::jsonb,
 '["Never post original high-resolution sale masters.","Never invent prices, availability, exhibitions, sales or art provenance.","Do not cross-post the identical caption to Freddy Bremseth umbrella or Re-Master Freddy."]'::jsonb,
 'Discover the artwork','Uncropped art in editorial frames; clean premium gallery; Art Lounge soundtrack secondary.',
 '["https://art.freddybremseth.com"]'::jsonb,'{}'::jsonb,now())
on conflict (brand_id) do update set
 brand_name=excluded.brand_name,voice=excluded.voice,audience=excluded.audience,
 languages=excluded.languages,markets=excluded.markets,services=excluded.services,
 value_proposition=excluded.value_proposition,allowed_claims=excluded.allowed_claims,
 forbidden_claims=excluded.forbidden_claims,preferred_cta=excluded.preferred_cta,
 visual_direction=excluded.visual_direction,urls=excluded.urls,updated_at=now();

-- Art remains SETUP until its own Instagram OAuth is validated through the UI.
insert into public.marketing_brand_growth_plans
(brand_id,website,status,autonomy_mode,source_types,planned_channels,conversion_goals,
 primary_ctas,posting_strategy,learning_strategy,metadata,updated_at)
values
('freddyart','https://art.freddybremseth.com','setup','approval_required',
 array['published_artwork','art_gallery','art_lounge_reel','original_music']::text[],
 array['instagram','website']::text[],
 array['artwork_view','gallery_visit','art_inquiry','art_follow']::text[],
 array['view_artwork','visit_gallery','follow','contact']::text[],
 '{"editorial_role":"art_first","reels":{"channel":"instagram","frequency":"daily","duration_seconds":[15,35],"target_seconds":27,"primary_source":"published_public_art_preview","soundtrack":"original_remaster_freddy"},"facebook":"No dedicated art Facebook page yet; send selective rewritten highlights only via freddyb umbrella, never fake an art page.","duplicate_policy":"no_same_media_and_caption_on_umbrella","private_originals":"blocked"}'::jsonb,
 '{"primary":["reel_views","shares","saves","profile_visits","gallery_clicks","art_inquiries"],"experiment":"Rotate genres and artworks; use actual per-channel outcomes, not follower count alone."}'::jsonb,
 '{"brand_role":"creator_media","owner_brand":"freddyb","creative_sub_brand":"art","art_lounge_cadence":"daily_27s","autopilot_activation":"waiting_for_exact_art_instagram_oauth_and_video_qa","cross_brand_repost":"selected_rewritten_only","no_umbrella_auto_copy":true}'::jsonb,now())
on conflict (brand_id) do update set
 website=excluded.website,source_types=excluded.source_types,
 planned_channels=excluded.planned_channels,conversion_goals=excluded.conversion_goals,
 primary_ctas=excluded.primary_ctas,posting_strategy=excluded.posting_strategy,
 learning_strategy=excluded.learning_strategy,
 metadata=public.marketing_brand_growth_plans.metadata || excluded.metadata,
 updated_at=now();

-- The umbrella is a public professional Facebook PAGE, never a private profile.
-- Leave its existing approval_required autonomy intact; no blind daily duplication.
update public.brand_context set
 voice='Personal, professional and editorial. Freddy tells his own creative story: artist, author, music creator and entrepreneur. Rewrite a selected brand story from Freddy''s perspective rather than copying product posts.',
 audience='People following Freddy Bremseth, his original art, Re-Master music, books and professional projects.',
 services='["creative work","art","books","original music","selected professional projects"]'::jsonb,
 value_proposition='The personal umbrella: who Freddy is, the story behind selected artworks, music releases and books; link to the relevant specialist brand.',
 allowed_claims='["Share verified firsthand stories about own art, music, books and work.","Attribute the source brand and link to its original artwork, track or book."]'::jsonb,
 forbidden_claims='["No identical automatic syndication from art, books or music.","Never publish commercial content to a private personal Facebook profile.","Do not claim unverified awards, sales, prices or rights."]'::jsonb,
 preferred_cta='Explore the original project',
 visual_direction='Editorial first-person posts, real original artwork previews, approved book covers and original music. Avoid generic automatic promo collages.',
 updated_at=now()
where brand_id='freddyb';
update public.marketing_brand_growth_plans set
 status='active',autonomy_mode='approval_required',
 source_types=array['personal_editorial','published_artwork','book_catalog','original_music','owned_project_story']::text[],
 planned_channels=array['facebook','instagram','linkedin','youtube','website','email']::text[],
 posting_strategy='{"editorial_role":"personal_umbrella","facebook_posts_per_week":[2,3],"art_reposts_per_week":[1,2],"music_reposts_per_week":[0,1],"book_reposts_per_week":[0,1],"reuse_policy":"Curate and rewrite personal perspective, do not repost identical videos/captions by default.","private_facebook_profile":"never_automate","source_required":"verified owned source","approval_mode":"approval_required"}'::jsonb,
 metadata=metadata||'{"brand_role":"personal_author","creative_umbrella":true,"autopilot_channels":[],"cross_brand_repost":"selected_rewritten_only","private_facebook_profile_not_destination":true}'::jsonb,
 updated_at=now() where brand_id='freddyb';

-- Keep the actual Re-Master Freddy account independent, with its existing
-- approved Facebook publishing untouched; music remains the primary subject.
update public.marketing_brand_growth_plans set
 metadata=metadata||'{"owner_brand":"freddyb","creative_sub_brand":"music","editorial_role":"music_first","art_lounge_repost":"only_with_rewritten_music_first_copy"}'::jsonb,
 updated_at=now() where brand_id='remasterfreddy';

-- Publishing is an independent book catalog brand. The EXISTING Facebook
-- connection is shared with the umbrella: never imply it is a dedicated page.
insert into public.brand_context
(brand_id,brand_name,voice,audience,languages,markets,services,value_proposition,
 allowed_claims,forbidden_claims,preferred_cta,visual_direction,urls,contact,updated_at)
values
('freddypublishing','Freddy Publishing',
 'Reader-focused, clear, consistent across series; descriptions grounded in actual published books.',
 'Readers of thrillers, nonfiction, travel and practical book series.',
 '["en","no","es"]'::jsonb,'["online","international"]'::jsonb,
 '["published book catalog","series","samples","book launches"]'::jsonb,
 'The dedicated publishing identity and catalog for Freddy Bremseth books.',
 '["Use verified published book details and cover assets only.","Link to the actual book page."]'::jsonb,
 '["Never invent reviews, awards, bestseller status or unpublished excerpts.","Do not mass-copy book ads onto the personal umbrella."]'::jsonb,
 'Discover the book','Readable cover-first visuals and series-consistent layouts.',
 '["https://books.freddybremseth.com"]'::jsonb,'{}'::jsonb,now())
on conflict (brand_id) do nothing;
insert into public.marketing_brand_growth_plans
(brand_id,website,status,autonomy_mode,source_types,planned_channels,conversion_goals,
 primary_ctas,posting_strategy,metadata,updated_at)
values
('freddypublishing','https://books.freddybremseth.com','setup','approval_required',
 array['book_catalog','book_covers','book_samples','book_launch']::text[],
 array['facebook','instagram','website','email']::text[],
 array['book_page_visit','sample_read','book_sale','reader_follow']::text[],
 array['view_book','read_sample','browse_catalog']::text[],
 '{"editorial_role":"books_first","umbrellas":"Selected author-story highlights on freddyb, rewritten, no identical mirrored promo","facebook":"Shared existing Freddy Bremseth Page is NOT an independent Freddy Publishing Page. Keep approval-gated until owner selects destination."}'::jsonb,
 '{"brand_role":"publishing","owner_brand":"freddyb","connection_review_required":"facebook_shared_with_umbrella","autopilot_channels":[]}'::jsonb,now())
on conflict (brand_id) do update set
 posting_strategy=excluded.posting_strategy,
 metadata=public.marketing_brand_growth_plans.metadata||excluded.metadata,
 updated_at=now();
