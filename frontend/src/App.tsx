import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { Board } from './pages/Board';
import { AppList } from './pages/AppList';
import { AppSettings } from './pages/AppSettings';
import { AiAssistant } from './pages/AiAssistant';
import { AiAdmin } from './pages/admin/AiAdmin';
import { RecordList } from './pages/RecordList';
import { RecordEditor } from './pages/RecordEditor';
import { RecordDetail } from './pages/RecordDetail';
import { GovDocViewer } from './pages/GovDocViewer';
import { Knowledge } from './pages/Knowledge';
import { PrintReport } from './pages/PrintReport';
import { PrintReportBatch } from './pages/PrintReportBatch';
import { PublicForm } from './pages/PublicForm';
import { UsersAdmin } from './pages/admin/UsersAdmin';
import { GroupsAdmin } from './pages/admin/GroupsAdmin';
import { AuditLogs } from './pages/admin/AuditLogs';
import { ChangePassword } from './pages/ChangePassword';
import { getToken, getUser, isAdmin, canManageDirectory } from './lib/auth';
import { ToastProvider } from './components/ui/Toast';
import { ConfirmProvider } from './components/ui/ConfirmDialog';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  if (!isAdmin(getUser())) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** ユーザー/グループ管理: SystemAdmin と GroupAdmin(管理者) が利用可能。 */
function DirectoryAdminRoute({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  if (!canManageDirectory(getUser())) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Router>
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

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default App;
