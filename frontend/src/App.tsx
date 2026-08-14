import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { getUser, isAdmin, canManageDirectory, migrateLegacySession } from './lib/auth';
import { api } from './lib/api';
import { ToastProvider } from './components/ui/Toast';
import { ConfirmProvider } from './components/ui/ConfirmDialog';

const Home = lazy(async () => ({ default: (await import('./pages/Home')).Home }));
const Dashboard = lazy(async () => ({ default: (await import('./pages/Dashboard')).Dashboard }));
const Board = lazy(async () => ({ default: (await import('./pages/Board')).Board }));
const AppList = lazy(async () => ({ default: (await import('./pages/AppList')).AppList }));
const AppSettings = lazy(async () => ({ default: (await import('./pages/AppSettings')).AppSettings }));
const AiAssistant = lazy(async () => ({ default: (await import('./pages/AiAssistant')).AiAssistant }));
const AiAdmin = lazy(async () => ({ default: (await import('./pages/admin/AiAdmin')).AiAdmin }));
const RecordList = lazy(async () => ({ default: (await import('./pages/RecordList')).RecordList }));
const RecordEditor = lazy(async () => ({ default: (await import('./pages/RecordEditor')).RecordEditor }));
const RecordDetail = lazy(async () => ({ default: (await import('./pages/RecordDetail')).RecordDetail }));
const GovDocViewer = lazy(async () => ({ default: (await import('./pages/GovDocViewer')).GovDocViewer }));
const Knowledge = lazy(async () => ({ default: (await import('./pages/Knowledge')).Knowledge }));
const PrintReport = lazy(async () => ({ default: (await import('./pages/PrintReport')).PrintReport }));
const PrintReportBatch = lazy(async () => ({ default: (await import('./pages/PrintReportBatch')).PrintReportBatch }));
const PublicForm = lazy(async () => ({ default: (await import('./pages/PublicForm')).PublicForm }));
const UsersAdmin = lazy(async () => ({ default: (await import('./pages/admin/UsersAdmin')).UsersAdmin }));
const GroupsAdmin = lazy(async () => ({ default: (await import('./pages/admin/GroupsAdmin')).GroupsAdmin }));
const AuditLogs = lazy(async () => ({ default: (await import('./pages/admin/AuditLogs')).AuditLogs }));
const SystemSettings = lazy(async () => ({ default: (await import('./pages/admin/SystemSettings')).SystemSettings }));
const ChangePassword = lazy(async () => ({ default: (await import('./pages/ChangePassword')).ChangePassword }));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!getUser()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  if (!getUser()) return <Navigate to="/login" replace />;
  if (!isAdmin(getUser())) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** ユーザー/グループ管理: SystemAdmin と GroupAdmin(管理者) が利用可能。 */
function DirectoryAdminRoute({ children }: { children: React.ReactNode }) {
  if (!getUser()) return <Navigate to="/login" replace />;
  if (!canManageDirectory(getUser())) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function App() {
  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => {
    void migrateLegacySession(api.base).finally(() => setSessionReady(true));
  }, []);

  if (!sessionReady) {
    return <div className="min-h-screen grid place-items-center text-muted">セッションを確認中...</div>;
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
        <Router>
          <Suspense fallback={<div className="min-h-screen grid place-items-center text-muted">読み込み中...</div>}>
          <Routes>
        <Route path="/login" element={<Login />} />
        {/* ログイン不要の匿名公開フォーム（ProtectedRoute の外） */}
        <Route path="/f/:token" element={<PublicForm />} />

        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/dashboards" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        {/* 状況把握ボード（サイネージ/全画面・Layout 不使用のスタンドアロン） */}
        <Route path="/board/:id" element={<ProtectedRoute><Board /></ProtectedRoute>} />
        <Route path="/ai" element={<ProtectedRoute><AiAssistant /></ProtectedRoute>} />
        {/* ナレッジ（一般ユーザー向け：可視文書の一覧＋チャット/検索） */}
        <Route path="/knowledge" element={<ProtectedRoute><Knowledge /></ProtectedRoute>} />
        {/* 文書ビューア（行政文書は目次・条ジャンプ、一般文書は本文表示） */}
        <Route path="/ai/documents/:id" element={<ProtectedRoute><GovDocViewer /></ProtectedRoute>} />
        <Route path="/apps" element={<ProtectedRoute><AppList /></ProtectedRoute>} />
        <Route path="/apps/:appId" element={<ProtectedRoute><RecordList /></ProtectedRoute>} />
        <Route path="/apps/:appId/settings" element={<ProtectedRoute><AppSettings /></ProtectedRoute>} />
        <Route path="/apps/:appId/records/new" element={<ProtectedRoute><RecordEditor /></ProtectedRoute>} />
        <Route path="/apps/:appId/records/:recordId" element={<ProtectedRoute><RecordDetail /></ProtectedRoute>} />
        <Route path="/apps/:appId/records/:recordId/edit" element={<ProtectedRoute><RecordEditor /></ProtectedRoute>} />
        {/* 帳票の印刷/PDF出力（Layout 不使用のスタンドアロン） */}
        <Route path="/apps/:appId/records/:recordId/print/:templateId" element={<ProtectedRoute><PrintReport /></ProtectedRoute>} />
        {/* 選択した複数レコードをまとめて印刷（?ids=a,b,c） */}
        <Route path="/apps/:appId/print/:templateId" element={<ProtectedRoute><PrintReportBatch /></ProtectedRoute>} />

        <Route path="/account/password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />

        <Route path="/admin/ai" element={<AdminRoute><AiAdmin /></AdminRoute>} />
        <Route path="/admin/users" element={<DirectoryAdminRoute><UsersAdmin /></DirectoryAdminRoute>} />
        <Route path="/admin/groups" element={<DirectoryAdminRoute><GroupsAdmin /></DirectoryAdminRoute>} />
        <Route path="/admin/audit" element={<AdminRoute><AuditLogs /></AdminRoute>} />
        <Route path="/admin/system" element={<AdminRoute><SystemSettings /></AdminRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </Router>
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default App;
