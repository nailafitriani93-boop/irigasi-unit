
-- =========================================================
-- DATABASE PORTAL IRIGASI
-- PostgreSQL
-- Login: Admin / User
-- Hak akses: PG1 / Kijung / Lakop / Divisi 2
-- Data: Engine / Irigator / Pipa
-- =========================================================

-- =========================================================
-- 1. MASTER AREA
-- =========================================================

CREATE TABLE IF NOT EXISTS irrigation_areas (
    name TEXT PRIMARY KEY,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO irrigation_areas (name)
VALUES
    ('Kijung'),
    ('Lakop'),
    ('Divisi 2')
ON CONFLICT (name) DO NOTHING;


-- =========================================================
-- 2. ROLE PENGGUNA
-- =========================================================

CREATE TABLE IF NOT EXISTS user_roles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT ''
);

INSERT INTO user_roles (id, name, description)
VALUES
    ('admin', 'Admin', 'Mengelola dashboard dan seluruh data irigasi.'),
    ('user', 'User', 'Mengakses dashboard sesuai hak akses area.')
ON CONFLICT (id) DO NOTHING;


-- =========================================================
-- 3. AKUN PENGGUNA
-- =========================================================

CREATE TABLE IF NOT EXISTS managed_users (
    id VARCHAR(150) PRIMARY KEY,
    name TEXT NOT NULL,
    username VARCHAR(150) NOT NULL UNIQUE,
    email TEXT NOT NULL DEFAULT '',
    gender VARCHAR(20) NOT NULL DEFAULT 'Pria',

    role_id VARCHAR(50) NOT NULL
        REFERENCES user_roles(id),

    status VARCHAR(20) NOT NULL DEFAULT 'Aktif',

    password_hash TEXT,

    access_pages JSONB NOT NULL DEFAULT '[]'::jsonb,

    area_scope TEXT NOT NULL DEFAULT 'PG1'
        CHECK (
            area_scope IN (
                'PG1',
                'Kijung',
                'Lakop',
                'Divisi 2'
            )
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_managed_users_role
ON managed_users(role_id);

CREATE INDEX IF NOT EXISTS idx_managed_users_area
ON managed_users(area_scope);

CREATE INDEX IF NOT EXISTS idx_managed_users_status
ON managed_users(status);


-- =========================================================
-- 4. RESET PASSWORD / OTP
-- =========================================================

CREATE TABLE IF NOT EXISTS password_reset_otps (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id VARCHAR(150) NOT NULL
        REFERENCES managed_users(id)
        ON DELETE CASCADE,

    otp_hash TEXT NOT NULL,
    channel VARCHAR(20) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,

    attempts INTEGER NOT NULL DEFAULT 0
        CHECK (attempts >= 0),

    used_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    reset_token_hash TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_user_created
ON password_reset_otps(user_id, created_at DESC);


-- =========================================================
-- 5. RIWAYAT AKTIVITAS PENGGUNA
-- =========================================================

CREATE TABLE IF NOT EXISTS user_activity_logs (
    id VARCHAR(150) PRIMARY KEY,
    waktu TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    pengguna TEXT NOT NULL,
    aktivitas TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_user_activity_logs_waktu
ON user_activity_logs(waktu DESC);


-- =========================================================
-- 6. DATA UTAMA ENGINE, IRIGATOR, DAN PIPA
-- =========================================================

CREATE TABLE IF NOT EXISTS irrigation_equipment (
    sheet VARCHAR(100) NOT NULL,

    row_number INTEGER NOT NULL
        CHECK (row_number > 0),

    type VARCHAR(50) NOT NULL,

    code VARCHAR(150) NOT NULL DEFAULT '',

    group_name TEXT NOT NULL DEFAULT '',

    area VARCHAR(100) NOT NULL DEFAULT '',

    status VARCHAR(100) NOT NULL DEFAULT '',

    note TEXT NOT NULL DEFAULT '',

    fields JSONB NOT NULL DEFAULT '{}'::jsonb,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (sheet, row_number),

    CONSTRAINT chk_irrigation_sheet
        CHECK (
            sheet IN (
                'EngineIrigasi',
                'IrigatorIrigasi',
                'PipaIrigasi'
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_irrigation_equipment_area
ON irrigation_equipment(area);

CREATE INDEX IF NOT EXISTS idx_irrigation_equipment_code
ON irrigation_equipment(code);

CREATE INDEX IF NOT EXISTS idx_irrigation_equipment_sheet
ON irrigation_equipment(sheet);

CREATE INDEX IF NOT EXISTS idx_irrigation_equipment_type
ON irrigation_equipment(type);

CREATE INDEX IF NOT EXISTS idx_irrigation_equipment_status
ON irrigation_equipment(status);

-- =========================================================
-- 6B. ASET YANG DIGUNAKAN OLEH API DASHBOARD
-- =========================================================

CREATE TABLE IF NOT EXISTS public.equipment (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    source_sheet TEXT NOT NULL
        CHECK (source_sheet IN ('EngineIrigasi', 'IrigatorIrigasi')),
    source_row INTEGER NOT NULL CHECK (source_row > 0),
    equipment_type TEXT NOT NULL
        CHECK (equipment_type IN ('Engine', 'Irrigator')),
    code TEXT NOT NULL,
    subtype TEXT NOT NULL DEFAULT '',
    acquired_year INTEGER,
    area_name TEXT,
    condition TEXT NOT NULL DEFAULT '',
    grade TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    source_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT equipment_source_sheet_type_check
        CHECK (
            (source_sheet = 'EngineIrigasi' AND equipment_type = 'Engine')
            OR
            (source_sheet = 'IrigatorIrigasi' AND equipment_type = 'Irrigator')
        ),
    CONSTRAINT equipment_source_sheet_source_row_key
        UNIQUE (source_sheet, source_row)
);

CREATE INDEX IF NOT EXISTS idx_equipment_area_name
ON public.equipment(area_name);

CREATE INDEX IF NOT EXISTS idx_equipment_code
ON public.equipment(code);

CREATE INDEX IF NOT EXISTS idx_equipment_type
ON public.equipment(equipment_type);


-- =========================================================
-- 7. MASTER PILIHAN / LOOKUP
-- =========================================================

CREATE TABLE IF NOT EXISTS irrigation_lookups (
    category VARCHAR(50) NOT NULL,
    value TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,

    PRIMARY KEY (category, value)
);

INSERT INTO irrigation_lookups (
    category,
    value,
    sort_order
)
VALUES
    ('equipment_condition', 'Ready', 1),
    ('equipment_condition', 'Perbaikan', 2),
    ('equipment_condition', 'Dipinjam', 3),
    ('equipment_condition', 'FADA', 4),

    ('equipment_grade', 'Good', 1),
    ('equipment_grade', 'Average', 2),
    ('equipment_grade', 'Poor', 3),

    ('pipe_condition', 'Good', 1),
    ('pipe_condition', 'Average', 2),
    ('pipe_condition', 'Poor', 3),
    ('pipe_condition', 'Reject', 4),

    ('water_source', 'Deep Well', 1),
    ('water_source', 'Reservoir', 2),

    ('calibration_status', 'Sudah', 1),
    ('calibration_status', 'Belum', 2)

ON CONFLICT (category, value) DO NOTHING;


-- =========================================================
-- 8. VIEW RINGKASAN JUMLAH DATA
-- =========================================================

CREATE OR REPLACE VIEW v_irrigation_equipment_summary AS
SELECT
    sheet,
    type,
    area,
    status,
    COUNT(*)::INTEGER AS total_data
FROM irrigation_equipment
GROUP BY
    sheet,
    type,
    area,
    status;

-- =========================================================
-- 9. RIWAYAT KALIBRASI ENGINE
-- =========================================================

CREATE TABLE IF NOT EXISTS public.irrigation_calibrations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    calibration_date DATE NOT NULL,
    engine_code VARCHAR(150) NOT NULL,
    area VARCHAR(100) NOT NULL,
    irrigator_code VARCHAR(150) NOT NULL,
    water_source TEXT NOT NULL,
    source_location TEXT NOT NULL DEFAULT '',
    pipe_count INTEGER CHECK (pipe_count IS NULL OR pipe_count > 0),
    engine_irrigator_distance NUMERIC CHECK (engine_irrigator_distance IS NULL OR engine_irrigator_distance >= 0),
    irrigator_gun_distance NUMERIC CHECK (irrigator_gun_distance IS NULL OR irrigator_gun_distance >= 0),
    engine_rpm NUMERIC CHECK (engine_rpm IS NULL OR engine_rpm > 0),
    hose_pressure_bar NUMERIC CHECK (hose_pressure_bar IS NULL OR hose_pressure_bar >= 0),
    nozzle_size_inch NUMERIC CHECK (nozzle_size_inch IS NULL OR nozzle_size_inch > 0),
    flow_meter VARCHAR(20) NOT NULL CHECK (flow_meter IN ('B,X1', 'B,X10')),
    measurements JSONB NOT NULL,
    results JSONB NOT NULL,
    fuel_per_hour NUMERIC CHECK (fuel_per_hour IS NULL OR fuel_per_hour >= 0),
    username VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_irrigation_calibrations_area_date
ON public.irrigation_calibrations(area, calibration_date DESC);

CREATE INDEX IF NOT EXISTS idx_irrigation_calibrations_engine
ON public.irrigation_calibrations(engine_code);

-- =========================================================
-- 10. RIWAYAT VERSI MASTER DATA IRIGASI
-- =========================================================

CREATE TABLE IF NOT EXISTS public.irrigation_master_data_versions (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    dataset_year INTEGER NOT NULL CHECK (dataset_year BETWEEN 2000 AND 2100),
    revision INTEGER NOT NULL CHECK (revision > 0),
    original_filename TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    workbook_bytes BYTEA NOT NULL,
    workbook_data JSONB NOT NULL,
    CONSTRAINT irrigation_master_data_year_revision_key
        UNIQUE (dataset_year, revision)
);

CREATE UNIQUE INDEX IF NOT EXISTS irrigation_master_data_one_active_idx
ON public.irrigation_master_data_versions (is_active)
WHERE is_active = TRUE;

-- =========================================================
-- SELESAI
-- =========================================================
