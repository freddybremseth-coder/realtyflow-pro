alter table public.properties add column if not exists town text;

create or replace function public.normalize_property_place_text(value text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      lower(
        translate(
          coalesce(value, ''),
          'áàäâãåéèëêíìïîóòöôõúùüûñç',
          'aaaaaaeeeeiiiiooooouuuunc'
        )
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.derive_property_town(
  p_title text,
  p_title_no text,
  p_location text,
  p_description text,
  p_description_no text,
  p_source_description text
)
returns text
language plpgsql
immutable
as $$
declare
  keys text[] := array[
    'banyeres de mariola','banyeres','hondon de las nieves','hondon de los frailes','hondon','monforte del cid','monforte','la romana','el pinos','pinoso','monovar','novelda','aspe','villena','biar','castalla','salinas','alguena','petrer','elda','agost','onil','tibi','ibi','sax','fortuna','abanilla','crevillent','crevillente',
    'alfas del pi','alfaz','albir','altea','calpe','calp','denia','finestrat','la nucia','nucia','moraira','teulada','polop','benidorm','el campello','campello','sant joan d alacant','sant joan','mutxamel','muchamiel','javea','xabia','villajoyosa','vila joiosa','benissa',
    'torrevieja','orihuela costa','orihuela','guardamar del segura','guardamar','santa pola','gran alacant','ciudad quesada','rojales','pilar de la horadada','los montesinos','algorfa','benijofar','dolores','catral','daya nueva','daya','bigastro','jacarilla','san miguel de salinas','san miguel','campoamor','la zenia','las heredades','almoradi',
    'san pedro del pinatar','san javier','los alcazares','torre pacheco','mazarron','aguilas','cartagena','fuente alamo','alhama de murcia','alhama','banos y mendigo','avileses','moratalla','la manga','lorca','murcia','vera playa','vera','almerimar'
  ];
  labels text[] := array[
    'Banyeres de Mariola','Banyeres de Mariola','Hondón de las Nieves','Hondón de los Frailes','Hondón','Monforte del Cid','Monforte del Cid','La Romana','Pinoso','Pinoso','Monóvar','Novelda','Aspe','Villena','Biar','Castalla','Salinas','Algueña','Petrer','Elda','Agost','Onil','Tibi','Ibi','Sax','Fortuna','Abanilla','Crevillent','Crevillent',
    'Alfàs del Pi','Alfàs del Pi','Albir','Altea','Calpe','Calpe','Dénia','Finestrat','La Nucía','La Nucía','Moraira','Teulada','Polop','Benidorm','El Campello','El Campello','Sant Joan d''Alacant','Sant Joan d''Alacant','Mutxamel','Mutxamel','Jávea','Jávea','Villajoyosa','Villajoyosa','Benissa',
    'Torrevieja','Orihuela Costa','Orihuela Costa','Guardamar del Segura','Guardamar del Segura','Santa Pola','Gran Alacant','Ciudad Quesada','Rojales','Pilar de la Horadada','Los Montesinos','Algorfa','Benijófar','Dolores','Catral','Daya Nueva','Daya Nueva','Bigastro','Jacarilla','San Miguel de Salinas','San Miguel de Salinas','Campoamor','La Zenia','Las Heredades','Almoradí',
    'San Pedro del Pinatar','San Javier','Los Alcázares','Torre Pacheco','Mazarrón','Águilas','Cartagena','Fuente Álamo','Alhama de Murcia','Alhama de Murcia','Baños y Mendigo','Avileses','Moratalla','La Manga','Lorca','Murcia','Vera Playa','Vera','Almerimar'
  ];
  hay text;
  needle text;
  hit_pos integer;
  best_pos integer;
  best_label text;
  i integer;
  loc_norm text;
begin
  loc_norm := public.normalize_property_place_text(p_location);

  -- 1. Structured location first, when it contains a known exact place name.
  hay := ' ' || loc_norm || ' ';
  best_pos := null;
  best_label := null;
  for i in 1..array_length(keys, 1) loop
    needle := ' ' || keys[i] || ' ';
    hit_pos := strpos(hay, needle);
    if hit_pos > 0 and (best_pos is null or hit_pos < best_pos) then
      best_pos := hit_pos;
      best_label := labels[i];
    end if;
  end loop;
  if best_label is not null then
    return best_label;
  end if;

  -- 2. Titles are stronger evidence than descriptive prose.
  hay := ' ' || public.normalize_property_place_text(coalesce(p_title, '') || ' ' || coalesce(p_title_no, '')) || ' ';
  best_pos := null;
  best_label := null;
  for i in 1..array_length(keys, 1) loop
    needle := ' ' || keys[i] || ' ';
    hit_pos := strpos(hay, needle);
    if hit_pos > 0 and (best_pos is null or hit_pos < best_pos) then
      best_pos := hit_pos;
      best_label := labels[i];
    end if;
  end loop;
  if best_label is not null then
    return best_label;
  end if;

  -- 3. Description fallback: exact words/phrases only. This deliberately prevents
  --    'vera' from matching 'veranda', 'verano', etc. The source description is
  --    placed first, so duplicated translated copy cannot outvote the real location.
  hay := ' ' || public.normalize_property_place_text(
    coalesce(p_source_description, '') || ' ' || coalesce(p_description, '') || ' ' || coalesce(p_description_no, '')
  ) || ' ';
  best_pos := null;
  best_label := null;
  for i in 1..array_length(keys, 1) loop
    needle := ' ' || keys[i] || ' ';
    hit_pos := strpos(hay, needle);
    if hit_pos > 0 and (best_pos is null or hit_pos < best_pos) then
      best_pos := hit_pos;
      best_label := labels[i];
    end if;
  end loop;
  if best_label is not null then
    return best_label;
  end if;

  -- 4. Safe regional fallback. Better a correct region than an invented town.
  if loc_norm = 'costa blanca south inland' then return 'Costa Blanca innland'; end if;
  if loc_norm = 'costa blanca north inland' then return 'Costa Blanca innland'; end if;
  if loc_norm = 'costa blanca inland' then return 'Costa Blanca innland'; end if;
  if loc_norm = 'costa blanca south' then return 'Costa Blanca Sør'; end if;
  if loc_norm = 'costa blanca north' then return 'Costa Blanca Nord'; end if;
  if loc_norm = 'costa blanca' then return 'Costa Blanca'; end if;
  if loc_norm = 'costa calida inland' then return 'Costa Cálida innland'; end if;
  if loc_norm = 'costa calida' then return 'Costa Cálida'; end if;
  if loc_norm = 'costa de almeria' then return 'Costa de Almería'; end if;
  if loc_norm = 'alicante province' then return 'Alicante'; end if;
  if loc_norm = 'murcia region' then return 'Murcia'; end if;

  return null;
end;
$$;

create or replace function public.set_canonical_property_town()
returns trigger
language plpgsql
as $$
begin
  new.town := public.derive_property_town(
    new.title,
    new.title_no,
    new.location,
    new.description,
    new.description_no,
    new.source_description
  );
  return new;
end;
$$;

drop trigger if exists trg_set_canonical_property_town on public.properties;
create trigger trg_set_canonical_property_town
before insert or update of title, title_no, location, description, description_no, source_description
on public.properties
for each row
execute function public.set_canonical_property_town();

update public.properties
set town = public.derive_property_town(title, title_no, location, description, description_no, source_description);

create index if not exists properties_town_idx on public.properties (town);
