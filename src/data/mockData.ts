import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Archive,
  Bell,
  CheckCircle2,
  Clock,
  Cloud,
  Database,
  FileText,
  FolderOpen,
  GitBranch,
  Link2,
  MessageSquare,
  Paperclip,
  ShieldCheck,
  UserRound,
  Users
} from "lucide-react";

export const db = {
  name: "Current Live DB",
  id: "db_20260703_154218",
  createdAt: "2026/07/03 15:42:18",
  lastBackup: "2026/07/03 15:42:18",
  size: "68.4 GB",
  capacity: "200 GB"
};

export const users = ["Alpha-Platform", "Ben Service", "Chia-Ting Wu", "Yen-Lang Chen", "Shu-Chen Kuo"];
export const projects = ["COPGEN1", "FW", "QA", "Alpha Platform", "Beta Service", "Customer Portal"];

export const trend = [
  { day: "06/27", total: 17000, alpha: 25000, ben: 17000, chia: 13000, yen: 9500, shu: 7000 },
  { day: "06/28", total: 23500, alpha: 29000, ben: 20500, chia: 16000, yen: 12000, shu: 8700 },
  { day: "06/29", total: 9200, alpha: 20000, ben: 15000, chia: 11500, yen: 8500, shu: 6200 },
  { day: "06/30", total: 17200, alpha: 23200, ben: 17500, chia: 13700, yen: 10300, shu: 7800 },
  { day: "07/01", total: 33000, alpha: 33000, ben: 24600, chia: 19400, yen: 14500, shu: 10400 },
  { day: "07/02", total: 19800, alpha: 27500, ben: 20500, chia: 16000, yen: 12100, shu: 8600 },
  { day: "07/03", total: 36000, alpha: 40000, ben: 30000, chia: 23500, yen: 17200, shu: 12000 }
];

export const eventTypes = [
  { name: "Issue Updated", value: 405619, color: "#2563eb" },
  { name: "Comment Added", value: 232513, color: "#8b5cf6" },
  { name: "Status Changed", value: 152414, color: "#16a34a" },
  { name: "Work Logged", value: 76351, color: "#f59e0b" },
  { name: "Issue Created", value: 69212, color: "#ef4444" },
  { name: "Others", value: 264247, color: "#94a3b8" }
];

export const projectActivity = [
  ["Alpha Platform", "214,532", "8,763", "2026/07/03 15:43:15"],
  ["Beta Service", "186,741", "7,425", "2026/07/03 15:43:10"],
  ["Customer Portal", "152,884", "6,112", "2026/07/03 15:43:08"],
  ["Data Platform", "128,965", "5,091", "2026/07/03 15:43:05"],
  ["Mobile App", "112,337", "4,287", "2026/07/03 15:43:01"]
];

export const activeUsers = [
  ["Chia-Ting Wu", "28,765", "12,341", "2026/07/03 15:42:58"],
  ["Yen-Liang Chen", "22,411", "9,876", "2026/07/03 15:42:41"],
  ["Ming-Chun Lin", "19,832", "8,543", "2026/07/03 15:42:33"],
  ["Shu-Chen Kuo", "17,654", "7,221", "2026/07/03 15:42:27"],
  ["Hao-Jie Huang", "15,320", "6,102", "2026/07/03 15:42:19"]
];

export const syncRuns = [
  ["2026/07/03 15:43:21", "Success", "12,841", "2,301", "124", "0", "00:02:14"],
  ["2026/07/03 15:13:21", "Success", "18,732", "4,118", "231", "0", "00:02:37"],
  ["2026/07/03 14:43:21", "Success", "15,609", "3,602", "177", "0", "00:02:11"],
  ["2026/07/03 14:13:21", "Success", "11,988", "1,932", "98", "0", "00:01:58"]
];

export const previewIssues = [
  ["AP-1234", "Improve login performance", "2026/07/03 15:38", "Alice Chen", "Bob Lin", "2 / 2", "37"],
  ["AP-1256", "Add SSO support", "2026/07/03 14:22", "Charlie Wu", "Diana Huang", "2 / 2", "28"],
  ["BS-2345", "Data export timeout issue", "2026/07/03 13:01", "Ethan Yeh", "Frank Lin", "2 / 2", "19"],
  ["BS-2456", "Fix API rate limit error", "2026/07/03 11:45", "Alice Chen", "Grace Lee", "2 / 2", "31"],
  ["AP-1301", "Refactor user profile page", "2026/07/03 10:12", "Bob Lin", "Charlie Wu", "2 / 2", "22"]
];

export const timelineEvents = [
  ["2026/05/31 15:24:31", "roger.hsieh", "comment_created", "COPGEN1-126606", "新增留言", "於 Issue 新增留言", "Local DB"],
  ["2026/05/31 15:18:07", "alice.chen", "field_changed", "COPGEN1-126606", "欄位變更", "priority: Medium -> High", "Local DB"],
  ["2026/05/31 15:05:45", "kevin.lin", "status_changed", "COPGEN1-126606", "狀態變更", "In Progress -> Review", "Local DB"],
  ["2026/05/31 14:58:12", "alice.chen", "attachment_added", "COPGEN1-126606", "新增附件", "screenshot_20250531.png", "Local DB"],
  ["2026/05/31 14:45:33", "roger.hsieh", "comment_created", "COPGEN1-126606", "新增留言", "補充說明與建議", "Local DB"],
  ["2026/05/31 13:42:18", "roger.hsieh", "status_changed", "COPGEN1-126606", "狀態變更", "To Do -> In Progress", "Local DB"],
  ["2026/05/31 12:31:55", "alice.chen", "issue_created", "COPGEN1-126606", "建立 Issue", "建立 Issue COPGEN1-126606", "Local DB"]
];

export const analysisRows = [
  ["Alpha-Platform", "214,532", "8,763", "3,845", "28,765", "120,341"],
  ["Ben Service", "168,741", "7,425", "2,984", "22,411", "95,782"],
  ["Chia-Ting Wu", "128,981", "6,112", "2,271", "19,832", "76,543"],
  ["Yen-Lang Chen", "106,781", "4,821", "1,837", "17,655", "60,324"],
  ["Shu-Chen Kuo", "97,621", "4,287", "1,639", "15,320", "51,812"]
];

export const jiraLifecycle = [
  ["Created", "2026/07/01 10:12:34", ""],
  ["First Response", "2026/07/01 11:03:21", "00h 50m"],
  ["In Progress", "2026/07/01 15:42:09", "04h 38m"],
  ["In Review", "2026/07/03 14:59:12", "01h 32m"],
  ["Closed", "2026/07/03 15:42:18", "00h 43m"]
];

export const debugLogs: Record<string, string[]> = {
  dashboard: ["Local DB connected", "Querying dashboard summary...", "Querying activity trend data...", "Querying event type breakdown...", "Querying project activity...", "Dashboard loaded successfully"],
  connections: ["Starting Jira Cloud connection test...", "Resolving base URL...", "Authentication successful", "Token scope valid", "Fetching projects...", "Connection test completed successfully"],
  import: ["Connected to Jira Cloud", "Resolving target users...", "Building JQL...", "Fetched issues: 2,184", "Estimating events...", "Preview completed"],
  timeline: ["sessionStorage enabled", "Query activity_events from local database", "Apply filters", "Execute SQL query", "Returned rows: 1,248", "Timeline ready"],
  analysis: ["Aggregate events from local database", "Compute per-user metrics", "Calculate event type distribution", "Render charts and tables", "Analysis ready"],
  jira: ["Load issue from local database", "Query activity_events...", "Compute lifecycle metrics", "Compute participant contribution", "Build risk hints", "Jira analysis ready"],
  jiraProbe: ["Initialize Jira Probe page", "Selected connection: Jira Cloud (Production)", "Token: [masked]", "Ready for read-only probe", "No database write will be performed"],
  settings: ["Loading settings...", "Checking database connection...", "Loading data management information...", "Loading backup history...", "Settings ready."]
};

export type Metric = {
  label: string;
  sub: string;
  value: string;
  icon: LucideIcon;
  tone: string;
};

export const metricIcons = {
  Activity,
  AlertTriangle,
  Archive,
  Bell,
  CheckCircle2,
  Clock,
  Cloud,
  Database,
  FileText,
  FolderOpen,
  GitBranch,
  Link2,
  MessageSquare,
  Paperclip,
  ShieldCheck,
  UserRound,
  Users
};
