import { useState } from 'react'
import { analytics } from '../lib/analytics'
import {
  browserAnnouncementStorage,
  dismissHomepageAnnouncement,
  isHomepageAnnouncementDismissed,
} from '../lib/announcement-dismissal'
import type { PublicHomepageAnnouncement } from '../lib/public-config'
import { useImpression } from '../lib/useImpression'

type HomepageAnnouncementProps = {
  announcement: PublicHomepageAnnouncement
}

export function HomepageAnnouncement({
  announcement,
}: HomepageAnnouncementProps) {
  const storage = browserAnnouncementStorage()
  const [dismissed, setDismissed] = useState(() =>
    isHomepageAnnouncementDismissed(storage, announcement),
  )
  const announcementRef = useImpression<HTMLElement>(
    'homepage_announcement_view',
  )
  const actionRef = useImpression<HTMLAnchorElement>(
    'homepage_announcement_action_view',
  )
  const closeRef = useImpression<HTMLButtonElement>(
    'homepage_announcement_close_view',
  )

  if (dismissed) return null

  return (
    <aside
      ref={announcementRef}
      id="homepage-announcement"
      className="fade-in-up relative mb-6 overflow-hidden rounded-xl px-4 py-3.5 sm:mb-8 sm:px-5"
      style={{
        background: 'linear-gradient(180deg, #F4F2EE 0%, #ECEAE6 100%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.07)',
      }}
      aria-label="站内公告"
    >
      <div
        className="absolute inset-y-3 left-0 w-[3px] rounded-r-full"
        style={{
          background: 'linear-gradient(180deg, #F05A2A 0%, #C4310E 100%)',
          boxShadow: '1px 0 2px rgba(196,49,14,0.18)',
        }}
        aria-hidden
      />

      <div className="flex items-start gap-3 sm:items-center sm:gap-4">
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:mt-0"
          style={{
            color: '#C4310E',
            background: 'linear-gradient(180deg, #F8F6F2 0%, #E8E5DF 100%)',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 1px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.08)',
          }}
          aria-hidden
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 13.5v-3a2 2 0 0 1 2-2h3l6-3.5v15l-6-3.5H6a2 2 0 0 1-2-2Z" />
            <path d="M9 16.5 10.5 21H7l-1.5-4.5" />
            <path d="M18 8.5a5 5 0 0 1 0 7" />
          </svg>
        </div>

        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
          <p
            className="min-w-0 flex-1 text-[13px] font-normal leading-5"
            style={{ color: '#1C1A18' }}
          >
            {announcement.message}
          </p>

          {announcement.action && (
            <a
              ref={actionRef}
              href={announcement.action.href}
              onClick={() =>
                analytics.track('homepage_announcement_action_click')
              }
              className="mt-3 inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-200 hover:-translate-y-0.5 active:scale-95 sm:mt-0"
              style={{
                color: '#C4310E',
                background: 'linear-gradient(180deg, #F8F6F2 0%, #EAE8E4 100%)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.07)',
              }}
            >
              <span>{announcement.action.label}</span>
              <svg
                viewBox="0 0 20 20"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m7 4 6 6-6 6" />
              </svg>
            </a>
          )}
        </div>

        <button
          ref={closeRef}
          type="button"
          aria-label="关闭公告"
          onClick={() => {
            analytics.track('homepage_announcement_close_click')
            dismissHomepageAnnouncement(storage, announcement)
            setDismissed(true)
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-black/5 active:scale-95"
          style={{ color: '#8A8680' }}
        >
          <svg
            viewBox="0 0 20 20"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
