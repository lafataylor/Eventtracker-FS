import { ReactNode } from 'react';
import Meta from './Meta';
import { withRouter, NextRouter } from 'next/router';

import { StoreProvider } from '../store/store';
import AuthManager from './AuthManager';

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
          <main className="w-full h-full">{children}</main>
        </AuthManager>
      </Providers>
    </>
  );
};

export default withRouter(Layout);
