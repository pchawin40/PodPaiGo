import AccountDashboard from './AccountDashboard';
import { getAdminEmails } from '../../lib/admin/adminAuth';

export default function AccountPage() {
  const adminEmails = getAdminEmails();

  return <AccountDashboard adminEmails={adminEmails} />;
}
