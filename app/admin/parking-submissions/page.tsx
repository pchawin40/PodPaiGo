import { getAdminEmails } from '../../../lib/admin/adminAuth';
import AdminParkingSubmissionsClient from './AdminParkingSubmissionsClient';

export default function AdminParkingSubmissionsPage() {
  return <AdminParkingSubmissionsClient adminEmails={getAdminEmails()} />;
}
