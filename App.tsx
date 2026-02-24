
import React, { ReactNode } from 'react';
import Layout from './components/Layout';
import Home from './components/Home';
import FullLedger from './components/Ledger';
import Reports from './components/Reports';
import SettingsPage from './components/SettingsPage';
import { StoreProvider, useStore } from './store/store';

// Keep old imports for backward compat (deep links, legacy routes)
import Overview from './components/Overview';
import Ingestion from './components/Ingestion';
import Library from './components/Library';
import ParseLab from './components/ParseLab';
import Registries from './components/Registries';
import MasterAnalysis from './components/MasterAnalysis';
import DirectorReconciliation from './components/DirectorReconciliation';
import { CompanyExpenses, CompanyRevenue, CompanyPnL, DirectorPersonal } from './components/FinancialViews';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full flex items-center justify-center bg-red-50 p-10">
          <div className="max-w-2xl w-full bg-white p-8 rounded-xl shadow-2xl border border-red-200">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Critical Application Error</h1>
            <pre className="bg-slate-900 text-slate-100 p-4 rounded overflow-auto text-xs font-mono mb-4">
              {this.state.error?.toString()}
              {'\n'}
              {this.state.error?.stack}
            </pre>
            <button onClick={() => window.location.reload()} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

const AppContent: React.FC = () => {
  const { state } = useStore();
  const tab = state.ui.nav.currentRoute;

  return (
    <Layout>
      {/* Primary routes */}
      {(tab === 'home' || tab === 'overview' || tab === 'ingest') && <Home />}
      {tab === 'ledger' && <FullLedger />}
      {tab === 'reports' && <Reports />}
      {(tab === 'settings' || tab === 'registries' || tab === 'library') && <SettingsPage />}

      {/* Legacy routes (still accessible if navigated to directly) */}
      {tab === 'parselab' && <ParseLab />}
      {tab === 'company_expenses' && <CompanyExpenses />}
      {tab === 'company_revenue' && <CompanyRevenue />}
      {tab === 'director_personal' && <DirectorPersonal />}
      {tab === 'p_n_l' && <CompanyPnL />}
      {tab === 'master_analysis' && <MasterAnalysis />}
      {tab === 'reconciliation' && <DirectorReconciliation />}
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <AppContent />
      </StoreProvider>
    </ErrorBoundary>
  );
};

export default App;

