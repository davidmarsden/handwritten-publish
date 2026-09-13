import type {
  MicroblogAccount,
  MicroblogDestination,
  MicroblogFeed,
  Paging,
} from './microblogSocial';

export type SocialProviderId = 'microblog' | 'mastodon';

export type SocialProviderCapabilities = {
  bookmarks: boolean;
  mentions: boolean;
  replies: boolean;
  conversations: boolean;
  profiles: boolean;
  destinations: boolean;
  bookmarking: boolean;
  replying: boolean;
  publishing: boolean;
};

export type SocialProviderAuth = {
  startPath: string;
  signOutPath: string;
};

export type SocialPublishResult = {
  ok?: boolean;
  url?: string | null;
  preview?: string | null;
};

/**
 * Provider boundary for Dent Hand's authenticated social account.
 *
 * The current implementation is Micro.blog. Methods beyond account/timeline are
 * optional so a future provider can advertise only the capabilities it actually
 * supports instead of emulating another network's API.
 */
export interface SocialProvider {
  readonly id: SocialProviderId;
  readonly label: string;
  readonly auth: SocialProviderAuth;
  readonly capabilities: SocialProviderCapabilities;

  account(): Promise<MicroblogAccount>;
  timeline(paging?: Paging): Promise<MicroblogFeed>;

  bookmarks?(paging?: Paging): Promise<MicroblogFeed>;
  mentions?(paging?: Paging): Promise<MicroblogFeed>;
  replies?(paging?: Paging): Promise<MicroblogFeed>;
  conversation?(id: string): Promise<MicroblogFeed>;
  profile?(username: string, paging?: Paging): Promise<MicroblogFeed>;
  destinations?(): Promise<MicroblogDestination[]>;
  bookmark?(id: string): Promise<{ ok?: boolean }>;
  unbookmark?(id: string): Promise<{ ok?: boolean }>;
  reply?(id: string, content: string): Promise<{ ok?: boolean; [key: string]: unknown }>;
  publish?(content: string, destination: string): Promise<SocialPublishResult>;
}
