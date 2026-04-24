export type SpotifyTrack = {
  spotifyTrackId: string | null;
  isrc: string | null;
  name: string;
  artists: string[];
  album: string | null;
  durationMs: number | null;
};

export type SpotifyPlaylist = {
  id: string;
  name: string;
  description: string | null;
  totalItems: number;
  tracks: SpotifyTrack[];
};

export type AppleSongCandidate = {
  id: string;
  name: string;
  artistName: string;
  albumName: string | null;
  durationMs: number | null;
  isrc: string | null;
};

export type MatchReason =
  | "isrc"
  | "exact-title-artist"
  | "normalized-title-artist"
  | "artist-only-fallback";

export type MatchResult = {
  source: SpotifyTrack;
  matched: boolean;
  confidence: number;
  reason: MatchReason | null;
  candidate: AppleSongCandidate | null;
  searchTerm?: string;
  candidates?: AppleSongCandidate[];
};

export type TransferReport = {
  playlistName: string;
  playlistId: string;
  matchedCount: number;
  unmatchedCount: number;
  matchRate: number;
  createdApplePlaylistId: string | null;
  dryRun: boolean;
  results: MatchResult[];
};

export type TransferAnalysis = Omit<TransferReport, "createdApplePlaylistId" | "dryRun">;
