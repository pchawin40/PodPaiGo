import fs from 'fs';
import path from 'path';

const adminComponentDir = path.join(process.cwd(), 'app', 'components', 'admin');

describe('admin analytics client boundaries', () => {
  it('does not import server DB modules from admin dashboard components', () => {
    const files = fs
      .readdirSync(adminComponentDir)
      .filter((name) => name.endsWith('.tsx'));

    for (const file of files) {
      const contents = fs.readFileSync(path.join(adminComponentDir, file), 'utf8');
      expect(contents).not.toMatch(/lib\/db\/client/);
      expect(contents).not.toMatch(/lib\/admin\/analyticsDashboard['"]/);
    }
  });

  it('admin analytics page does not import server analytics query module', () => {
    const pagePath = path.join(process.cwd(), 'app', 'admin', 'analytics', 'page.tsx');
    const contents = fs.readFileSync(pagePath, 'utf8');
    expect(contents).not.toMatch(/lib\/admin\/analyticsDashboard['"]/);
    expect(contents).not.toMatch(/lib\/db\/client/);
  });
});
