export type Participant = {
  id: string;
  browser_id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
};

export type Idea = {
  id: string;
  title: string;
  description: string | null;
  author_id: string;
  created_at: string;
  updated_at: string;
};

export type Vote = {
  id: string;
  idea_id: string;
  participant_id: string;
  created_at: string;
};

export type IdeaCardData = Idea & {
  author: Pick<Participant, 'id' | 'display_name'> | null;
  votes: Array<
    Vote & {
      voter: Pick<Participant, 'id' | 'display_name'> | null;
    }
  >;
};

export type BoardIdea = {
  id: string;
  title: string;
  description: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  voteCount: number;
  voters: Array<{ id: string; name: string }>;
  hasMyVote: boolean;
  isMine: boolean;
};
