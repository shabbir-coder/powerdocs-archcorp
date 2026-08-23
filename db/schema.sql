-- ============================================================
-- Archcorp DCC — Document Register & Projects schema
-- All tables use a "Dcc" prefix: this SQL Server database (SB)
-- is shared with an unrelated pre-existing app, and a plain
-- "Employees" table already exists there with a different shape.
-- Each block is idempotent (IF OBJECT_ID(...) IS NULL) and
-- separated by a marker line so migrate.js can run them as
-- individual batches (SQL Server needs GO, which the mssql
-- driver's .query() does not support directly).
-- ============================================================

IF OBJECT_ID('dbo.DccClients') IS NULL
BEGIN
  CREATE TABLE dbo.DccClients (
    Id      VARCHAR(20)   NOT NULL PRIMARY KEY,
    Name    NVARCHAR(200) NOT NULL,
    Code    VARCHAR(20)   NOT NULL,
    City    NVARCHAR(100) NOT NULL
  );
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccProjects') IS NULL
BEGIN
  CREATE TABLE dbo.DccProjects (
    Id        VARCHAR(20)   NOT NULL PRIMARY KEY,
    Pid       VARCHAR(30)   NOT NULL UNIQUE,
    Name      NVARCHAR(300) NOT NULL,
    ClientId  VARCHAR(20)   NOT NULL REFERENCES dbo.DccClients(Id),
    City      NVARCHAR(100) NOT NULL,
    Status    NVARCHAR(50)  NOT NULL,
    StartDate DATE          NOT NULL
  );
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccEmployees') IS NULL
BEGIN
  CREATE TABLE dbo.DccEmployees (
    Id    VARCHAR(20)   NOT NULL PRIMARY KEY,
    Name  NVARCHAR(200) NOT NULL,
    Email NVARCHAR(200) NOT NULL,
    Disc  NVARCHAR(50)  NOT NULL,
    Dept  NVARCHAR(100) NOT NULL,
    Role  NVARCHAR(20)  NOT NULL,
    Title NVARCHAR(150) NOT NULL
  );
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccFirms') IS NULL
BEGIN
  CREATE TABLE dbo.DccFirms (
    Id   VARCHAR(20)   NOT NULL PRIMARY KEY,
    Name NVARCHAR(200) NOT NULL,
    Code VARCHAR(20)   NOT NULL
  );
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccContractors') IS NULL
BEGIN
  CREATE TABLE dbo.DccContractors (
    Id     VARCHAR(20)   NOT NULL PRIMARY KEY,
    Name   NVARCHAR(200) NOT NULL,
    Email  NVARCHAR(200) NOT NULL,
    FirmId VARCHAR(20)   NOT NULL REFERENCES dbo.DccFirms(Id),
    Title  NVARCHAR(150) NOT NULL
  );
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccProjectAssignments') IS NULL
BEGIN
  CREATE TABLE dbo.DccProjectAssignments (
    Id         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ProjectId  VARCHAR(20) NOT NULL REFERENCES dbo.DccProjects(Id),
    PersonId   VARCHAR(20) NOT NULL,
    PersonType VARCHAR(20) NOT NULL CHECK (PersonType IN ('internal', 'contractor'))
  );
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccDocuments') IS NULL
BEGIN
  CREATE TABLE dbo.DccDocuments (
    Id          VARCHAR(20)   NOT NULL PRIMARY KEY,
    Ref         VARCHAR(50)   NOT NULL,
    ProjectId   VARCHAR(20)   NOT NULL REFERENCES dbo.DccProjects(Id),
    Type        NVARCHAR(100) NOT NULL,
    Title       NVARCHAR(400) NOT NULL,
    Disciplines NVARCHAR(200) NOT NULL,
    FirmId      VARCHAR(20)   NOT NULL REFERENCES dbo.DccFirms(Id),
    SubmittedBy VARCHAR(20)   NOT NULL,
    ReviewerIds NVARCHAR(200) NOT NULL,
    Status      NVARCHAR(50)  NOT NULL,
    Flow        NVARCHAR(20)  NOT NULL,
    Priority    NVARCHAR(10)  NOT NULL,
    Round       INT           NOT NULL DEFAULT 1,
    Category    NVARCHAR(100) NOT NULL,
    DueDays     INT           NOT NULL,
    Created     DATETIME2     NOT NULL,
    Updated     DATETIME2     NOT NULL,
    Storage     NVARCHAR(400) NOT NULL,
    Activity    VARCHAR(30)   NULL,
    LeadDays    INT           NULL,
    Material    NVARCHAR(200) NULL,
    Qty         NVARCHAR(100) NULL
  );
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccDocumentFiles') IS NULL
BEGIN
  CREATE TABLE dbo.DccDocumentFiles (
    Id           INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    DocumentId   VARCHAR(20)  NOT NULL REFERENCES dbo.DccDocuments(Id),
    Kind         VARCHAR(10)  NOT NULL CHECK (Kind IN ('in', 'out')),
    OriginalName NVARCHAR(300) NOT NULL,
    StoredName   NVARCHAR(1000) NOT NULL,
    Version      INT          NOT NULL,
    SizeLabel    VARCHAR(20)  NOT NULL,
    UploadedAt   DATETIME2    NOT NULL
  );
END
@@SPLIT@@
-- StoredName now holds a full Firebase Storage download URL (with a signed
-- token), which can exceed the original 300-char budget — widen if this
-- table already existed from before the Firebase migration.
IF COL_LENGTH('dbo.DccDocumentFiles', 'StoredName') IS NOT NULL AND COL_LENGTH('dbo.DccDocumentFiles', 'StoredName') < 1000
BEGIN
  ALTER TABLE dbo.DccDocumentFiles ALTER COLUMN StoredName NVARCHAR(1000) NOT NULL;
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccDocumentThread') IS NULL
BEGIN
  CREATE TABLE dbo.DccDocumentThread (
    Id          VARCHAR(20)  NOT NULL PRIMARY KEY,
    DocumentId  VARCHAR(20)  NOT NULL REFERENCES dbo.DccDocuments(Id),
    SeqIndex    INT          NOT NULL,
    ByPerson    VARCHAR(20)  NOT NULL,
    Role        NVARCHAR(20) NOT NULL,
    Type        VARCHAR(10)  NOT NULL CHECK (Type IN ('snag', 'comment', 'reply')),
    LocX        INT          NULL,
    LocY        INT          NULL,
    Page        INT          NOT NULL DEFAULT 1,
    Status      VARCHAR(10)  NULL CHECK (Status IN ('open', 'resolved')),
    Txt         NVARCHAR(MAX) NOT NULL,
    ParentIndex INT          NULL,
    CreatedAt   DATETIME2    NOT NULL
  );
END
@@SPLIT@@
-- Pinned review points used to always render against page 1 of the preview —
-- reviewers had no way to say which page of a multi-page PDF a pin belongs
-- to, so a pin dropped further down the document silently drifted onto
-- whatever page happened to be scrolled into view later. Existing rows default to 1.
IF COL_LENGTH('dbo.DccDocumentThread', 'Page') IS NULL
BEGIN
  ALTER TABLE dbo.DccDocumentThread ADD Page INT NOT NULL DEFAULT 1;
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccDocumentHistory') IS NULL
BEGIN
  CREATE TABLE dbo.DccDocumentHistory (
    Id         VARCHAR(20)   NOT NULL PRIMARY KEY,
    DocumentId VARCHAR(20)   NOT NULL REFERENCES dbo.DccDocuments(Id),
    ProjectId  VARCHAR(20)   NOT NULL REFERENCES dbo.DccProjects(Id),
    At         DATETIME2     NOT NULL,
    Action     NVARCHAR(100) NOT NULL,
    Actor      VARCHAR(20)   NOT NULL,
    Role       NVARCHAR(20)  NOT NULL,
    Round      INT           NOT NULL,
    Comment    NVARCHAR(MAX) NULL
  );
END
@@SPLIT@@
-- ============================================================
-- Soft-delete support on master data, so CRUD deletes never
-- break FK references from Documents/Projects/Assignments.
-- ============================================================
IF COL_LENGTH('dbo.DccClients', 'IsActive') IS NULL
BEGIN
  ALTER TABLE dbo.DccClients ADD IsActive BIT NOT NULL DEFAULT 1;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccProjects', 'IsActive') IS NULL
BEGIN
  ALTER TABLE dbo.DccProjects ADD IsActive BIT NOT NULL DEFAULT 1;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccEmployees', 'IsActive') IS NULL
BEGIN
  ALTER TABLE dbo.DccEmployees ADD IsActive BIT NOT NULL DEFAULT 1;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccFirms', 'IsActive') IS NULL
BEGIN
  ALTER TABLE dbo.DccFirms ADD IsActive BIT NOT NULL DEFAULT 1;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccContractors', 'IsActive') IS NULL
BEGIN
  ALTER TABLE dbo.DccContractors ADD IsActive BIT NOT NULL DEFAULT 1;
END
@@SPLIT@@
-- ============================================================
-- Login credentials for portal accounts. Admin employees sign in
-- via Microsoft SSO and never get a hash here; Reviewer employees
-- and Contractors are created inside the DCC app itself, so they
-- authenticate with an Admin-issued password instead.
-- ============================================================
IF COL_LENGTH('dbo.DccEmployees', 'PasswordHash') IS NULL
BEGIN
  ALTER TABLE dbo.DccEmployees ADD PasswordHash NVARCHAR(255) NULL;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccContractors', 'PasswordHash') IS NULL
BEGIN
  ALTER TABLE dbo.DccContractors ADD PasswordHash NVARCHAR(255) NULL;
END
@@SPLIT@@
-- ============================================================
-- Lookup / master-data tables. Id is the canonical value itself
-- (e.g. 'Shop Drawing', 'Architecture') so every existing free-text
-- column that already stores these strings (Documents.Type,
-- Employees.Disc, etc.) keeps working unchanged — these tables
-- make the valid-value list admin-manageable instead of hardcoded.
-- ============================================================
IF OBJECT_ID('dbo.DccDisciplines') IS NULL
BEGIN
  CREATE TABLE dbo.DccDisciplines (
    Id        VARCHAR(50)  NOT NULL PRIMARY KEY,
    Name      NVARCHAR(50) NOT NULL,
    SortOrder INT          NOT NULL DEFAULT 0
  );
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccDepartments') IS NULL
BEGIN
  CREATE TABLE dbo.DccDepartments (
    Id        VARCHAR(50)   NOT NULL PRIMARY KEY,
    Name      NVARCHAR(100) NOT NULL,
    SortOrder INT           NOT NULL DEFAULT 0
  );
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccCategories') IS NULL
BEGIN
  CREATE TABLE dbo.DccCategories (
    Id        VARCHAR(50)   NOT NULL PRIMARY KEY,
    Name      NVARCHAR(100) NOT NULL,
    SortOrder INT           NOT NULL DEFAULT 0
  );
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccPriorities') IS NULL
BEGIN
  CREATE TABLE dbo.DccPriorities (
    Id        VARCHAR(20)  NOT NULL PRIMARY KEY,
    Name      NVARCHAR(20) NOT NULL,
    SortOrder INT          NOT NULL DEFAULT 0
  );
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccReviewCodes') IS NULL
BEGIN
  CREATE TABLE dbo.DccReviewCodes (
    Id        VARCHAR(10)   NOT NULL PRIMARY KEY,
    Name      NVARCHAR(200) NOT NULL,
    SortOrder INT           NOT NULL DEFAULT 0
  );
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccDocTypes') IS NULL
BEGIN
  CREATE TABLE dbo.DccDocTypes (
    Id              VARCHAR(100)  NOT NULL PRIMARY KEY,
    Name            NVARCHAR(100) NOT NULL,
    CategoryId      VARCHAR(50)   NOT NULL REFERENCES dbo.DccCategories(Id),
    RefCode         VARCHAR(10)   NOT NULL,
    DefaultDueDays  INT           NOT NULL DEFAULT 14,
    SortOrder       INT           NOT NULL DEFAULT 0
  );
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccStatuses') IS NULL
BEGIN
  CREATE TABLE dbo.DccStatuses (
    Id              VARCHAR(50)   NOT NULL PRIMARY KEY,
    Name            NVARCHAR(50)  NOT NULL,
    CssClass        VARCHAR(30)   NOT NULL,
    ReviewCode      VARCHAR(10)   NOT NULL REFERENCES dbo.DccReviewCodes(Id),
    IsCompletedFlow BIT           NOT NULL DEFAULT 0,
    SortOrder       INT           NOT NULL DEFAULT 0
  );
END
@@SPLIT@@
-- ============================================================
-- Site Snags — standalone kanban entity (distinct from the
-- Type='snag' rows on DccDocumentThread, which stay as-is).
-- ============================================================
IF OBJECT_ID('dbo.DccSnags') IS NULL
BEGIN
  CREATE TABLE dbo.DccSnags (
    Id         VARCHAR(20)   NOT NULL PRIMARY KEY,
    Ref        VARCHAR(50)   NOT NULL,
    ProjectId  VARCHAR(20)   NOT NULL REFERENCES dbo.DccProjects(Id),
    Discipline NVARCHAR(50)  NOT NULL,
    Location   NVARCHAR(200) NOT NULL,
    Descr      NVARCHAR(MAX) NOT NULL,
    RaisedBy   VARCHAR(20)   NOT NULL,
    AssignedTo VARCHAR(20)   NOT NULL,
    Priority   NVARCHAR(10)  NOT NULL,
    Status     NVARCHAR(30)  NOT NULL,
    Created    DATETIME2     NOT NULL,
    Closed     DATETIME2     NULL,
    Photo      BIT           NOT NULL DEFAULT 0
  );
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccDues') IS NULL
BEGIN
  CREATE TABLE dbo.DccDues (
    Id        VARCHAR(20)   NOT NULL PRIMARY KEY,
    Kind      VARCHAR(20)   NOT NULL CHECK (Kind IN ('receivable', 'payable')),
    ProjectId VARCHAR(20)   NOT NULL REFERENCES dbo.DccProjects(Id),
    Party     VARCHAR(20)   NOT NULL,
    Number    VARCHAR(50)   NOT NULL,
    Amount    DECIMAL(14,2) NOT NULL,
    Paid      DECIMAL(14,2) NOT NULL DEFAULT 0,
    Issued    DATETIME2     NOT NULL,
    DueDate   DATETIME2     NOT NULL,
    Status    VARCHAR(20)   NOT NULL
  );
END
@@SPLIT@@
IF OBJECT_ID('dbo.DccScheduleActivities') IS NULL
BEGIN
  CREATE TABLE dbo.DccScheduleActivities (
    Id         VARCHAR(30)   NOT NULL PRIMARY KEY,
    ProjectId  VARCHAR(20)   NOT NULL REFERENCES dbo.DccProjects(Id),
    Wbs        NVARCHAR(100) NOT NULL,
    Name       NVARCHAR(200) NOT NULL,
    Disc       NVARCHAR(50)  NOT NULL,
    StartDate  DATETIME2     NOT NULL,
    FinishDate DATETIME2     NOT NULL,
    Critical   BIT           NOT NULL DEFAULT 0,
    FloatDays  INT           NOT NULL DEFAULT 0
  );
END
@@SPLIT@@
-- ============================================================
-- Project Master enrichment fields — previously Angular-local only
-- (disciplines/categories/numbering pattern/workflow template id/
-- customized numbering config), which meant they reset on every
-- refresh once real API-backed bootstrap replaced local seed data.
-- Disciplines/Categories are comma-joined, same convention as
-- DccDocuments.Disciplines/ReviewerIds above. NumberingConfig is a
-- JSON blob (per-project customization of the Aconex code tables).
-- ============================================================
IF COL_LENGTH('dbo.DccProjects', 'Workflow') IS NULL
BEGIN
  ALTER TABLE dbo.DccProjects ADD Workflow VARCHAR(20) NULL;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccProjects', 'Disciplines') IS NULL
BEGIN
  ALTER TABLE dbo.DccProjects ADD Disciplines NVARCHAR(400) NULL;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccProjects', 'Categories') IS NULL
BEGIN
  ALTER TABLE dbo.DccProjects ADD Categories NVARCHAR(400) NULL;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccProjects', 'Numbering') IS NULL
BEGIN
  ALTER TABLE dbo.DccProjects ADD Numbering NVARCHAR(200) NULL;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccProjects', 'NumberingConfig') IS NULL
BEGIN
  ALTER TABLE dbo.DccProjects ADD NumberingConfig NVARCHAR(MAX) NULL;
END
@@SPLIT@@
-- Reference back to the source project in Autodesk Construction Cloud when a project
-- master record was created via the "Import from ACC" picker, rather than typed in
-- from scratch — lets the UI show/avoid re-importing the same ACC project twice.
IF COL_LENGTH('dbo.DccProjects', 'AccId') IS NULL
BEGIN
  ALTER TABLE dbo.DccProjects ADD AccId NVARCHAR(100) NULL;
END
@@SPLIT@@
-- Review vs. snagging handling mode — previously Angular-local only.
IF COL_LENGTH('dbo.DccDocuments', 'Mode') IS NULL
BEGIN
  ALTER TABLE dbo.DccDocuments ADD Mode VARCHAR(20) NOT NULL DEFAULT 'review';
END
@@SPLIT@@
-- ============================================================
-- Workflow templates — previously seeded only in the Angular app's
-- local state (wf1/wf2/wf3), so every browser could see a different
-- set and nothing was shared. There's no UI to create/edit templates
-- yet (read-only reference data, same as the lookup tables), so the
-- whole nested shape (steps, status labels, initiator flags) is kept
-- as one JSON blob rather than normalized into child tables — nothing
-- ever queries into individual steps at the SQL level.
-- ============================================================
IF OBJECT_ID('dbo.DccWorkflowTemplates') IS NULL
BEGIN
  CREATE TABLE dbo.DccWorkflowTemplates (
    Id       VARCHAR(20)   NOT NULL PRIMARY KEY,
    Name     NVARCHAR(160) NOT NULL,
    DataJson NVARCHAR(MAX) NOT NULL
  );
END
@@SPLIT@@
-- ============================================================
-- Mail & Transmittals — previously Angular-local only.
-- ToPersons/DocumentIds are comma-joined ids, same convention as
-- DccDocuments.ReviewerIds.
-- ============================================================
IF OBJECT_ID('dbo.DccTransmittals') IS NULL
BEGIN
  CREATE TABLE dbo.DccTransmittals (
    Id          VARCHAR(20)   NOT NULL PRIMARY KEY,
    Number      VARCHAR(50)   NOT NULL,
    ProjectId   VARCHAR(20)   NOT NULL REFERENCES dbo.DccProjects(Id),
    MailType    NVARCHAR(60)  NOT NULL DEFAULT 'Transmittal',
    Purpose     NVARCHAR(100) NOT NULL,
    FromPerson  VARCHAR(20)   NOT NULL,
    ToPersons   NVARCHAR(400) NOT NULL,
    DocumentIds NVARCHAR(400) NOT NULL,
    CreatedAt   DATETIME2     NOT NULL,
    Status      NVARCHAR(30)  NOT NULL DEFAULT 'Issued',
    Remarks     NVARCHAR(MAX) NULL
  );
END
@@SPLIT@@
-- ============================================================
-- Per-project chat — previously Angular-local only. ByPerson can be
-- the literal 'ai' or 'sys' for assistant/system messages, so it's
-- not FK-constrained to DccEmployees/DccContractors.
-- ============================================================
IF OBJECT_ID('dbo.DccChatMessages') IS NULL
BEGIN
  CREATE TABLE dbo.DccChatMessages (
    Id        VARCHAR(20)   NOT NULL PRIMARY KEY,
    ProjectId VARCHAR(20)   NOT NULL REFERENCES dbo.DccProjects(Id),
    ByPerson  VARCHAR(20)   NOT NULL,
    Txt       NVARCHAR(MAX) NOT NULL,
    Kind      VARCHAR(10)   NOT NULL CHECK (Kind IN ('msg', 'ai', 'sys')),
    CreatedAt DATETIME2     NOT NULL
  );
END
@@SPLIT@@
-- ============================================================
-- Notifications — previously Angular-local only. IsRead mirrors the
-- existing single shared flag in the Angular model (not per-recipient
-- — every listed recipient shares one read state, matching current
-- behaviour exactly rather than introducing a new fan-out concept).
-- ============================================================
IF OBJECT_ID('dbo.DccNotifications') IS NULL
BEGIN
  CREATE TABLE dbo.DccNotifications (
    Id         VARCHAR(20)   NOT NULL PRIMARY KEY,
    ToPersons  NVARCHAR(400) NOT NULL,
    FromPerson VARCHAR(20)   NOT NULL,
    DocumentId VARCHAR(20)   NULL REFERENCES dbo.DccDocuments(Id),
    ProjectId  VARCHAR(20)   NOT NULL REFERENCES dbo.DccProjects(Id),
    Txt        NVARCHAR(MAX) NOT NULL,
    Kind       NVARCHAR(30)  NOT NULL,
    IsRead     BIT           NOT NULL DEFAULT 0,
    CreatedAt  DATETIME2     NOT NULL
  );
END
@@SPLIT@@
-- ============================================================
-- Markup Studio strokes — previously Angular-local only. One row per
-- document; the whole mark array is replaced wholesale on save
-- (matching how the client already calls saveMarkups(docId, marks)),
-- so a single JSON blob column is the pragmatic fit — the pen/marker/
-- rect/arrow/cloud/text discriminated union has no per-field query
-- need that would justify normalizing it into child tables.
-- ============================================================
IF OBJECT_ID('dbo.DccDocumentMarkups') IS NULL
BEGIN
  CREATE TABLE dbo.DccDocumentMarkups (
    DocumentId VARCHAR(20)   NOT NULL PRIMARY KEY REFERENCES dbo.DccDocuments(Id),
    MarksJson  NVARCHAR(MAX) NOT NULL,
    UpdatedAt  DATETIME2     NOT NULL
  );
END
@@SPLIT@@
-- ============================================================
-- Project distribution matrix (discipline -> reviewer -> action) —
-- previously Angular-local only, written once from Project Master
-- and never persisted server-side.
-- ============================================================
IF OBJECT_ID('dbo.DccProjectDistribution') IS NULL
BEGIN
  CREATE TABLE dbo.DccProjectDistribution (
    Id         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ProjectId  VARCHAR(20)  NOT NULL REFERENCES dbo.DccProjects(Id),
    Disc       NVARCHAR(60) NOT NULL,
    ReviewerId VARCHAR(20)  NOT NULL,
    Action     NVARCHAR(60) NOT NULL
  );
END
@@SPLIT@@
-- ============================================================
-- Collaborative member reviews — one live endorse/object/comment
-- verdict per project member per document; re-submitting replaces
-- that member's own row (matching the existing client behaviour of
-- filtering out their prior verdict before pushing a new one).
-- ============================================================
IF OBJECT_ID('dbo.DccMemberReviews') IS NULL
BEGIN
  CREATE TABLE dbo.DccMemberReviews (
    Id         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    DocumentId VARCHAR(20)   NOT NULL REFERENCES dbo.DccDocuments(Id),
    PersonId   VARCHAR(20)   NOT NULL,
    Verdict    VARCHAR(10)   NOT NULL CHECK (Verdict IN ('endorse', 'object', 'comment')),
    Comment    NVARCHAR(MAX) NULL,
    At         DATETIME2     NOT NULL,
    CONSTRAINT UQ_MemberReviews_DocPerson UNIQUE (DocumentId, PersonId)
  );
END
@@SPLIT@@
-- ============================================================
-- Simulated decision-email log (Admin > System tab) — previously
-- Angular-local only.
-- ============================================================
IF OBJECT_ID('dbo.DccEmailLog') IS NULL
BEGIN
  CREATE TABLE dbo.DccEmailLog (
    Id         VARCHAR(20)   NOT NULL PRIMARY KEY,
    ToEmail    NVARCHAR(200) NOT NULL,
    FirmName   NVARCHAR(200) NOT NULL,
    Subject    NVARCHAR(300) NOT NULL,
    Body       NVARCHAR(MAX) NOT NULL,
    DocumentId VARCHAR(20)   NOT NULL REFERENCES dbo.DccDocuments(Id),
    CreatedAt  DATETIME2     NOT NULL,
    Type       VARCHAR(30)   NOT NULL
  );
END
@@SPLIT@@
-- A transmittal covers many documents at once (not exactly one), so its email-log
-- entries have no single DocumentId to point at — loosen the FK column to nullable
-- rather than pick one document arbitrarily.
IF COLUMNPROPERTY(OBJECT_ID('dbo.DccEmailLog'), 'DocumentId', 'AllowsNull') = 0
BEGIN
  ALTER TABLE dbo.DccEmailLog ALTER COLUMN DocumentId VARCHAR(20) NULL;
END
@@SPLIT@@
-- ============================================================
-- Aconex-style composed document number (DocNo) and the segments that
-- build it — previously computed only in the Angular prototype's seed
-- data and never actually produced when a real document was submitted
-- (createDocument only ever set the plain Ref). Nullable: existing rows
-- and any upload that omits a segment fall back to defaults in code.
-- ============================================================
IF COL_LENGTH('dbo.DccDocuments', 'DocNo') IS NULL
BEGIN
  ALTER TABLE dbo.DccDocuments ADD DocNo NVARCHAR(150) NULL;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccDocuments', 'Originator') IS NULL
BEGIN
  ALTER TABLE dbo.DccDocuments ADD Originator VARCHAR(10) NULL;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccDocuments', 'Functional') IS NULL
BEGIN
  ALTER TABLE dbo.DccDocuments ADD Functional VARCHAR(10) NULL;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccDocuments', 'Spatial') IS NULL
BEGIN
  ALTER TABLE dbo.DccDocuments ADD Spatial VARCHAR(10) NULL;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccDocuments', 'Form') IS NULL
BEGIN
  ALTER TABLE dbo.DccDocuments ADD Form VARCHAR(10) NULL;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccDocuments', 'DiscCode') IS NULL
BEGIN
  ALTER TABLE dbo.DccDocuments ADD DiscCode VARCHAR(10) NULL;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccDocuments', 'StageCode') IS NULL
BEGIN
  ALTER TABLE dbo.DccDocuments ADD StageCode VARCHAR(10) NULL;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccDocuments', 'Stage') IS NULL
BEGIN
  ALTER TABLE dbo.DccDocuments ADD Stage NVARCHAR(50) NULL;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccDocuments', 'ReasonForIssue') IS NULL
BEGIN
  ALTER TABLE dbo.DccDocuments ADD ReasonForIssue NVARCHAR(100) NULL;
END
@@SPLIT@@
IF COL_LENGTH('dbo.DccDocuments', 'CreatedByOrg') IS NULL
BEGIN
  ALTER TABLE dbo.DccDocuments ADD CreatedByOrg NVARCHAR(200) NULL;
END
