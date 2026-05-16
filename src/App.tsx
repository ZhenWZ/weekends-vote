import {
  Check,
  CircleAlert,
  Laptop,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  ThumbsUp,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { BoardIdea, IdeaCardData, Participant } from './types';
import { getBrowserId, getOrCreateParticipant, getStoredDisplayName } from './lib/identity';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const titleLimit = 80;
const descriptionLimit = 420;

const formatUpdatedAt = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const normalizeIdea = (idea: IdeaCardData, currentParticipantId?: string): BoardIdea => {
  const voters = idea.votes
    .map((vote) => ({
      id: vote.participant_id,
      name: vote.voter?.display_name ?? '匿名',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  return {
    id: idea.id,
    title: idea.title,
    description: idea.description ?? '',
    authorId: idea.author_id,
    authorName: idea.author?.display_name ?? '匿名',
    createdAt: idea.created_at,
    updatedAt: idea.updated_at,
    voteCount: idea.votes.length,
    voters,
    hasMyVote: Boolean(currentParticipantId && idea.votes.some((vote) => vote.participant_id === currentParticipantId)),
    isMine: idea.author_id === currentParticipantId,
  };
};

const emptyDraft = { title: '', description: '' };

function App() {
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [ideas, setIdeas] = useState<BoardIdea[]>([]);
  const [newIdea, setNewIdea] = useState(emptyDraft);
  const [editIdeaId, setEditIdeaId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(emptyDraft);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savingIdea, setSavingIdea] = useState(false);
  const [actionIdeaId, setActionIdeaId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const browserIdPreview = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return getBrowserId().slice(0, 8);
  }, []);

  const fetchIdeas = useCallback(async (currentParticipant?: Participant | null) => {
    if (!isSupabaseConfigured) {
      return;
    }

    setLoadingBoard(true);
    setError('');

    const { data, error: fetchError } = await supabase
      .from('ideas')
      .select(
        `
          id,
          title,
          description,
          author_id,
          created_at,
          updated_at,
          author:participants!ideas_author_id_fkey(id, display_name),
          votes(
            id,
            idea_id,
            participant_id,
            created_at,
            voter:participants!votes_participant_id_fkey(id, display_name)
          )
        `,
      )
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setLoadingBoard(false);
      return;
    }

    const normalized = ((data ?? []) as unknown as IdeaCardData[]).map((idea) =>
      normalizeIdea(idea, currentParticipant?.id),
    );

    setIdeas(normalized);
    setLoadingBoard(false);
  }, []);

  const saveDisplayName = useCallback(
    async (displayName: string, options?: { silent?: boolean }) => {
      const normalizedName = displayName.trim();
      if (!normalizedName) {
        setError('请输入用户名后再继续');
        return;
      }

      setSavingName(true);
      setError('');
      setMessage('');

      try {
        const nextParticipant = await getOrCreateParticipant(normalizedName);
        setParticipant(nextParticipant);
        setDisplayNameInput(nextParticipant.display_name);
        await fetchIdeas(nextParticipant);
        if (!options?.silent) {
          setMessage(`当前身份已切换为 ${nextParticipant.display_name}`);
        }
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : '保存用户名失败');
      } finally {
        setSavingName(false);
      }
    },
    [fetchIdeas],
  );

  useEffect(() => {
    const storedName = getStoredDisplayName();
    setDisplayNameInput(storedName);

    if (!isSupabaseConfigured) {
      return;
    }

    if (storedName) {
      void saveDisplayName(storedName, { silent: true });
    } else {
      void fetchIdeas(null);
    }
  }, [fetchIdeas, saveDisplayName]);

  const requireParticipant = () => {
    if (!participant) {
      setError('请先设置用户名');
      return null;
    }

    return participant;
  };

  const handleNameSubmit = (event: FormEvent) => {
    event.preventDefault();
    void saveDisplayName(displayNameInput);
  };

  const handleIdeaSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const currentParticipant = requireParticipant();
    if (!currentParticipant) {
      return;
    }

    const title = newIdea.title.trim();
    const description = newIdea.description.trim();

    if (!title) {
      setError('请输入 idea 标题');
      return;
    }

    setSavingIdea(true);
    setError('');
    setMessage('');

    const { error: insertError } = await supabase.from('ideas').insert({
      title,
      description: description || null,
      author_id: currentParticipant.id,
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      setNewIdea(emptyDraft);
      setMessage('idea 已提交');
      await fetchIdeas(currentParticipant);
    }

    setSavingIdea(false);
  };

  const startEditing = (idea: BoardIdea) => {
    setEditIdeaId(idea.id);
    setEditDraft({
      title: idea.title,
      description: idea.description,
    });
    setError('');
    setMessage('');
  };

  const cancelEditing = () => {
    setEditIdeaId(null);
    setEditDraft(emptyDraft);
  };

  const submitEdit = async (event: FormEvent, idea: BoardIdea) => {
    event.preventDefault();
    const currentParticipant = requireParticipant();
    if (!currentParticipant) {
      return;
    }

    const title = editDraft.title.trim();
    const description = editDraft.description.trim();

    if (!title) {
      setError('idea 标题不能为空');
      return;
    }

    setActionIdeaId(idea.id);
    setError('');
    setMessage('');

    const { data, error: updateError } = await supabase
      .from('ideas')
      .update({
        title,
        description: description || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', idea.id)
      .eq('author_id', currentParticipant.id)
      .select('id')
      .maybeSingle();

    if (updateError) {
      setError(updateError.message);
    } else if (!data) {
      setError('只有提交者可以修改这个 idea');
    } else {
      cancelEditing();
      setMessage('idea 已更新');
      await fetchIdeas(currentParticipant);
    }

    setActionIdeaId(null);
  };

  const toggleVote = async (idea: BoardIdea) => {
    const currentParticipant = requireParticipant();
    if (!currentParticipant) {
      return;
    }

    setActionIdeaId(idea.id);
    setError('');
    setMessage('');

    const response = idea.hasMyVote
      ? await supabase.from('votes').delete().eq('idea_id', idea.id).eq('participant_id', currentParticipant.id)
      : await supabase.from('votes').insert({
          idea_id: idea.id,
          participant_id: currentParticipant.id,
        });

    if (response.error) {
      setError(response.error.message);
    } else {
      await fetchIdeas(currentParticipant);
    }

    setActionIdeaId(null);
  };

  const sortedIdeas = useMemo(
    () =>
      [...ideas].sort((first, second) => {
        if (second.voteCount !== first.voteCount) {
          return second.voteCount - first.voteCount;
        }

        return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
      }),
    [ideas],
  );

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div>
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <MapPin size={24} />
            </span>
            <div>
              <h1>周末去哪</h1>
              <p>收集大家的想法，看票数决定这周末的目的地。</p>
            </div>
          </div>
        </div>

        <form className="identity-panel" onSubmit={handleNameSubmit}>
          <label htmlFor="displayName">用户名</label>
          <div className="identity-row">
            <div className="input-with-icon">
              <UserRound size={18} aria-hidden="true" />
              <input
                id="displayName"
                value={displayNameInput}
                maxLength={32}
                onChange={(event) => setDisplayNameInput(event.target.value)}
                placeholder="例如：小王"
                disabled={!isSupabaseConfigured || savingName}
              />
            </div>
            <button className="button button-primary" type="submit" disabled={!isSupabaseConfigured || savingName}>
              {savingName ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
              保存
            </button>
          </div>
          <p className="identity-note">
            <Laptop size={14} aria-hidden="true" />
            浏览器 {browserIdPreview || '--------'} + 用户名识别身份
          </p>
        </form>
      </section>

      {!isSupabaseConfigured ? (
        <section className="setup-warning" role="status">
          <CircleAlert size={22} aria-hidden="true" />
          <div>
            <h2>需要配置 Supabase</h2>
            <p>
              复制 <code>.env.example</code> 为 <code>.env.local</code>，填入 <code>VITE_SUPABASE_URL</code> 和{' '}
              <code>VITE_SUPABASE_ANON_KEY</code> 后重新启动。
            </p>
          </div>
        </section>
      ) : null}

      <section className="workspace-grid">
        <aside className="compose-panel">
          <div className="section-heading">
            <span className="section-icon" aria-hidden="true">
              <Plus size={18} />
            </span>
            <div>
              <h2>提交 idea</h2>
              <p>{participant ? `当前用户：${participant.display_name}` : '先保存用户名，再提交想法'}</p>
            </div>
          </div>

          <form className="idea-form" onSubmit={handleIdeaSubmit}>
            <label htmlFor="ideaTitle">标题</label>
            <input
              id="ideaTitle"
              value={newIdea.title}
              maxLength={titleLimit}
              onChange={(event) => setNewIdea((draft) => ({ ...draft, title: event.target.value }))}
              placeholder="比如：去湖边骑车"
              disabled={!participant || savingIdea}
            />

            <label htmlFor="ideaDescription">补充说明</label>
            <textarea
              id="ideaDescription"
              value={newIdea.description}
              maxLength={descriptionLimit}
              onChange={(event) => setNewIdea((draft) => ({ ...draft, description: event.target.value }))}
              placeholder="时间、预算、集合点或推荐理由"
              disabled={!participant || savingIdea}
            />

            <button className="button button-primary wide" type="submit" disabled={!participant || savingIdea}>
              {savingIdea ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
              添加到看板
            </button>
          </form>
        </aside>

        <section className="board-panel">
          <div className="board-toolbar">
            <div className="section-heading">
              <span className="section-icon" aria-hidden="true">
                <UsersRound size={18} />
              </span>
              <div>
                <h2>Idea 看板</h2>
                <p>{ideas.length ? `${ideas.length} 个想法，按票数排序` : '还没有想法'}</p>
              </div>
            </div>

            <button className="button button-secondary" onClick={() => void fetchIdeas(participant)} disabled={loadingBoard}>
              {loadingBoard ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
              刷新
            </button>
          </div>

          {error ? <div className="status status-error">{error}</div> : null}
          {message ? <div className="status status-success">{message}</div> : null}

          {loadingBoard && !ideas.length ? (
            <div className="empty-state">
              <Loader2 className="spin" size={22} />
              正在加载看板
            </div>
          ) : null}

          {!loadingBoard && !ideas.length ? (
            <div className="empty-state">
              <MapPin size={24} />
              第一个周末 idea 等你来写
            </div>
          ) : null}

          <div className="idea-grid">
            {sortedIdeas.map((idea) => {
              const isEditing = editIdeaId === idea.id;
              const isBusy = actionIdeaId === idea.id;

              return (
                <article className={idea.isMine ? 'idea-card idea-card-mine' : 'idea-card'} key={idea.id}>
                  {isEditing ? (
                    <form className="edit-form" onSubmit={(event) => void submitEdit(event, idea)}>
                      <label htmlFor={`edit-title-${idea.id}`}>标题</label>
                      <input
                        id={`edit-title-${idea.id}`}
                        value={editDraft.title}
                        maxLength={titleLimit}
                        onChange={(event) => setEditDraft((draft) => ({ ...draft, title: event.target.value }))}
                        disabled={isBusy}
                      />
                      <label htmlFor={`edit-description-${idea.id}`}>补充说明</label>
                      <textarea
                        id={`edit-description-${idea.id}`}
                        value={editDraft.description}
                        maxLength={descriptionLimit}
                        onChange={(event) => setEditDraft((draft) => ({ ...draft, description: event.target.value }))}
                        disabled={isBusy}
                      />
                      <div className="card-actions">
                        <button className="button button-primary" type="submit" disabled={isBusy}>
                          {isBusy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
                          保存
                        </button>
                        <button className="button button-ghost" type="button" onClick={cancelEditing} disabled={isBusy}>
                          <X size={18} />
                          取消
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="idea-card-header">
                        <div>
                          <h3>{idea.title}</h3>
                          <p>
                            {idea.authorName} · 更新于 {formatUpdatedAt(idea.updatedAt)}
                          </p>
                        </div>
                        <div className="vote-count">
                          <strong>{idea.voteCount}</strong>
                          <span>票</span>
                        </div>
                      </div>

                      {idea.description ? <p className="idea-description">{idea.description}</p> : null}

                      <div className="voter-list">
                        <span>投票人</span>
                        {idea.voters.length ? (
                          <div className="voter-chips">
                            {idea.voters.map((voter, index) => (
                              <span className="chip" key={`${voter.id}-${index}`}>
                                {voter.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p>暂时无人投票</p>
                        )}
                      </div>

                      <div className="card-actions">
                        <button
                          className={idea.hasMyVote ? 'button button-voted' : 'button button-primary'}
                          onClick={() => void toggleVote(idea)}
                          disabled={!participant || isBusy}
                        >
                          {isBusy ? <Loader2 className="spin" size={18} /> : <ThumbsUp size={18} />}
                          {idea.hasMyVote ? '取消投票' : '投一票'}
                        </button>

                        {idea.isMine ? (
                          <button className="button button-secondary" onClick={() => startEditing(idea)} disabled={isBusy}>
                            <Pencil size={18} />
                            编辑
                          </button>
                        ) : null}
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
