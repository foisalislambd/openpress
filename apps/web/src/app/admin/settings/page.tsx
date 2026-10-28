'use client';

import { Input, Select, Textarea } from '@/components/ui';
import { SettingsForm } from '@/components/admin/screen';

export default function SettingsPage() {
  return (
    <SettingsForm title="General Settings">
      {(settings, set) => (
        <>
          <tr>
            <th scope="row">Site Title</th>
            <td>
              <Input
                value={settings.siteTitle}
                onChange={(e) => set({ siteTitle: e.target.value })}
              />
            </td>
          </tr>
          <tr>
            <th scope="row">Tagline</th>
            <td>
              <Textarea
                rows={2}
                value={settings.siteDescription}
                onChange={(e) => set({ siteDescription: e.target.value })}
              />
              <p className="op-description">In a few words, explain what this site is about.</p>
            </td>
          </tr>
          <tr>
            <th scope="row">Administration Email Address</th>
            <td>
              <Input
                type="email"
                value={String(settings.adminEmail ?? '')}
                onChange={(e) => set({ adminEmail: e.target.value })}
              />
            </td>
          </tr>
          <tr>
            <th scope="row">Timezone</th>
            <td>
              <Select
                value={String(settings.timezone ?? 'UTC')}
                onChange={(e) => set({ timezone: e.target.value })}
              >
                {['UTC', 'Asia/Dhaka', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'America/Los_Angeles'].map(
                  (zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ),
                )}
              </Select>
            </td>
          </tr>
          <tr>
            <th scope="row">Date Format</th>
            <td>
              <Select
                value={String(settings.dateFormat ?? 'F j, Y')}
                onChange={(e) => set({ dateFormat: e.target.value })}
              >
                <option value="F j, Y">F j, Y — October 28, 2026</option>
                <option value="Y-m-d">Y-m-d — 2026-10-28</option>
                <option value="m/d/Y">m/d/Y — 10/28/2026</option>
                <option value="d/m/Y">d/m/Y — 28/10/2026</option>
              </Select>
            </td>
          </tr>
          <tr>
            <th scope="row">Time Format</th>
            <td>
              <Select
                value={String(settings.timeFormat ?? 'g:i a')}
                onChange={(e) => set({ timeFormat: e.target.value })}
              >
                <option value="g:i a">g:i a — 10:42 am</option>
                <option value="H:i">H:i — 10:42</option>
              </Select>
            </td>
          </tr>
          <tr>
            <th scope="row">Week Starts On</th>
            <td>
              <Select
                value={String(settings.weekStartsOn ?? '1')}
                onChange={(e) => set({ weekStartsOn: e.target.value })}
              >
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="6">Saturday</option>
              </Select>
            </td>
          </tr>
          <tr>
            <th scope="row">Site Language</th>
            <td>
              <Select
                value={String(settings.siteLanguage ?? 'en')}
                onChange={(e) => set({ siteLanguage: e.target.value })}
              >
                <option value="en">English</option>
                <option value="bn">বাংলা</option>
              </Select>
            </td>
          </tr>
          <tr>
            <th scope="row">Membership</th>
            <td>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(settings.allowRegistration)}
                  onChange={(e) => set({ allowRegistration: e.target.checked })}
                />
                Anyone can register
              </label>
            </td>
          </tr>
        </>
      )}
    </SettingsForm>
  );
}
