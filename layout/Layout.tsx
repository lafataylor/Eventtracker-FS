import { ReactNode } from 'react';
import Meta from './Meta';
import { withRouter, NextRouter } from 'next/router';

import { StoreProvider } from '../store/store';
import AuthManager from './AuthManager';
import ErrorBoundary from '../components/ErrorBoundary';

interface ProviderProps {
  path: string | undefined;
  children?: ReactNode;
}

interface LayoutProps {
  children?: ReactNode;
  router: NextRouter;
}

const Providers = ({ path, children }: ProviderProps) => {
  return <StoreProvider>{children}</StoreProvider>;
};

const Layout = ({ children, router }: LayoutProps) => {
  return (
    <>
      <Providers path={router.pathname}>
        <AuthManager>
          {/* Inside the providers on purpose: the fallback still needs the
              store and auth context, and a crash in page content should cost
              the content, not the whole app (2026-09-01 outage). */}
          <main className="w-full h-full">
            <ErrorBoundary resetKey={router.asPath}>{children}</ErrorBoundary>
          </main>
        </AuthManager>
      </Providers>
    </>
  );
};

export default withRouter(Layout);
