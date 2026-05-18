import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ImagePlus,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  ThumbsUp,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import type { ChangeEvent, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardIdea, IdeaCardData, Participant } from './types';
import { getOrCreateParticipant, getStoredDisplayName } from './lib/identity';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const titleLimit = 80;
const descriptionLimit = 420;
const maxIdeaImages = 3;
const maxImageBytes = 3 * 1024 * 1024;
const ideaImageBucket = 'idea-images';
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const imageExtensionsByType: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

type ActivePage = 'submit' | 'board';
type BoardView = 'card' | 'list';
type IdeaDraft = { title: string; description: string };
type SelectedImage = { id: string; file: File; previewUrl: string };

const emptyDraft: IdeaDraft = { title: '', description: '' };

const formatUpdatedAt = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const createClientId = () =>
  globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getErrorMessage = (caughtError: unknown, fallback: string) =>
  caughtError instanceof Error ? caughtError.message : fallback;

const getImageExtension = (file: File) => imageExtensionsByType[file.type] ?? 'jpg';

const getIdeaImagePublicUrl = (storagePath: string) =>
  supabase.storage.from(ideaImageBucket).getPublicUrl(storagePath).data.publicUrl;

const normalizeIdea = (idea: IdeaCardData, currentParticipantId?: string): BoardIdea => {
  const voters = idea.votes
    .map((vote) => ({
      id: vote.participant_id,
      name: vote.voter?.display_name ?? '匿名',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  const images = [...(idea.images ?? [])]
    .sort((first, second) => {
      if (first.sort_order !== second.sort_order) {
        return first.sort_order - second.sort_order;
      }

      return new Date(first.created_at).getTime() - new Date(second.created_at).getTime();
    })
    .map((image) => ({
      id: image.id,
      storagePath: image.storage_path,
      sortOrder: image.sort_order,
      url: getIdeaImagePublicUrl(image.storage_path),
    }));

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
    images,
    hasMyVote: Boolean(currentParticipantId && idea.votes.some((vote) => vote.participant_id === currentParticipantId)),
    isMine: idea.author_id === currentParticipantId,
  };
};

const uploadIdeaImage = async (ideaId: string, selectedImage: SelectedImage, sortOrder: number) => {
  const storagePath = `${ideaId}/${createClientId()}.${getImageExtension(selectedImage.file)}`;
  const { error: uploadError } = await supabase.storage.from(ideaImageBucket).upload(storagePath, selectedImage.file, {
    cacheControl: '3600',
    contentType: selectedImage.file.type,
    upsert: false,
  });

  if (uploadError) {
    throw uploadError;
  }

  const { error: imageRecordError } = await supabase.from('idea_images').insert({
    idea_id: ideaId,
    storage_path: storagePath,
    sort_order: sortOrder,
  });

  if (imageRecordError) {
    await supabase.storage.from(ideaImageBucket).remove([storagePath]);
    throw imageRecordError;
  }
};

function IdeaImageCarousel({ images, title }: { images: BoardIdea['images']; title: string }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [images]);

  if (!images.length) {
    return null;
  }

  const safeIndex = Math.min(activeIndex, images.length - 1);
  const activeImage = images[safeIndex];
  const hasMultipleImages = images.length > 1;

  const showPreviousImage = () => {
    setActiveIndex((index) => (index === 0 ? images.length - 1 : index - 1));
  };

  const showNextImage = () => {
    setActiveIndex((index) => (index + 1) % images.length);
  };

  return (
    <div className="image-carousel">
      <img src={activeImage.url} alt={`${title} 图片 ${safeIndex + 1}`} />

      {hasMultipleImages ? (
        <>
          <button className="carousel-button carousel-button-left" type="button" onClick={showPreviousImage} aria-label="上一张图片">
            <ChevronLeft size={18} />
          </button>
          <button className="carousel-button carousel-button-right" type="button" onClick={showNextImage} aria-label="下一张图片">
            <ChevronRight size={18} />
          </button>
          <div className="carousel-dots" aria-label={`共 ${images.length} 张图片`}>
            {images.map((image, index) => (
              <button
                className={index === safeIndex ? 'carousel-dot carousel-dot-active' : 'carousel-dot'}
                key={image.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`查看第 ${index + 1} 张图片`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState<ActivePage>('board');
  const [boardView, setBoardView] = useState<BoardView>('card');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [ideas, setIdeas] = useState<BoardIdea[]>([]);
  const [newIdea, setNewIdea] = useState<IdeaDraft>(emptyDraft);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [editIdeaId, setEditIdeaId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<IdeaDraft>(emptyDraft);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savingIdea, setSavingIdea] = useState(false);
  const [actionIdeaId, setActionIdeaId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const selectedImagesRef = useRef<SelectedImage[]>([]);

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  useEffect(
    () => () => {
      selectedImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    },
    [],
  );

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
          images:idea_images(
            id,
            idea_id,
            storage_path,
            sort_order,
            created_at
          ),
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
        setError(getErrorMessage(caughtError, '保存用户名失败'));
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

  const clearSelectedImages = useCallback(() => {
    setSelectedImages((currentImages) => {
      currentImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      return [];
    });
  }, []);

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

  const handleImageSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const pickedFiles = Array.from(input.files ?? []);
    input.value = '';

    if (!pickedFiles.length) {
      return;
    }

    const availableSlots = maxIdeaImages - selectedImages.length;
    const validationMessages: string[] = [];

    if (availableSlots <= 0) {
      setMessage('');
      setError(`每个 idea 最多上传 ${maxIdeaImages} 张图片`);
      return;
    }

    if (pickedFiles.length > availableSlots) {
      validationMessages.push(`每个 idea 最多 ${maxIdeaImages} 张图片，已忽略多余图片`);
    }

    const nextImages = pickedFiles.slice(0, availableSlots).flatMap((file) => {
      if (!allowedImageTypes.has(file.type)) {
        validationMessages.push(`${file.name} 不是支持的图片格式`);
        return [];
      }

      if (file.size > maxImageBytes) {
        validationMessages.push(`${file.name} 超过 3MB`);
        return [];
      }

      return [
        {
          id: createClientId(),
          file,
          previewUrl: URL.createObjectURL(file),
        },
      ];
    });

    if (nextImages.length) {
      setSelectedImages((currentImages) => [...currentImages, ...nextImages]);
    }

    setMessage('');
    setError(validationMessages.join('；'));
  };

  const removeSelectedImage = (imageId: string) => {
    setSelectedImages((currentImages) => {
      const removedImage = currentImages.find((image) => image.id === imageId);
      if (removedImage) {
        URL.revokeObjectURL(removedImage.previewUrl);
      }

      return currentImages.filter((image) => image.id !== imageId);
    });
  };

  const handleIdeaSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const currentParticipant = requireParticipant();
    if (!currentParticipant) {
      return;
    }

    const title = newIdea.title.trim();
    const description = newIdea.description.trim();
    const pendingImages = selectedImages;

    if (!title) {
      setError('请输入 idea 标题');
      return;
    }

    setSavingIdea(true);
    setError('');
    setMessage('');

    try {
      const { data: createdIdea, error: insertError } = await supabase
        .from('ideas')
        .insert({
          title,
          description: description || null,
          author_id: currentParticipant.id,
        })
        .select('id')
        .single();

      if (insertError || !createdIdea) {
        setError(insertError?.message ?? '提交 idea 失败');
        return;
      }

      const imageResults = pendingImages.length
        ? await Promise.allSettled(pendingImages.map((image, index) => uploadIdeaImage(createdIdea.id, image, index)))
        : [];
      const failedUploads = imageResults.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );

      setNewIdea(emptyDraft);
      clearSelectedImages();
      await fetchIdeas(currentParticipant);
      setActivePage('board');

      if (failedUploads.length) {
        const uploadMessages = failedUploads
          .map((result) => getErrorMessage(result.reason, '图片上传失败'))
          .slice(0, 2)
          .join('；');

        setMessage('idea 已提交');
        setError(`${failedUploads.length} 张图片上传失败：${uploadMessages}`);
      } else {
        setMessage('idea 已提交');
      }
    } finally {
      setSavingIdea(false);
    }
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

  const imageUploadDisabled = !participant || savingIdea || selectedImages.length >= maxIdeaImages;

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
            <UsersRound size={14} aria-hidden="true" />
            同一用户名会被识别为同一个人，跨浏览器也一致
          </p>
        </form>
      </section>

      <nav className="app-nav" aria-label="主要导航">
        <button
          className={activePage === 'submit' ? 'nav-button nav-button-active' : 'nav-button'}
          type="button"
          onClick={() => setActivePage('submit')}
          aria-current={activePage === 'submit' ? 'page' : undefined}
        >
          <Plus size={18} />
          提交 idea
        </button>
        <button
          className={activePage === 'board' ? 'nav-button nav-button-active' : 'nav-button'}
          type="button"
          onClick={() => setActivePage('board')}
          aria-current={activePage === 'board' ? 'page' : undefined}
        >
          <UsersRound size={18} />
          Idea 看板
        </button>
      </nav>

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

      {error || message ? (
        <div className="status-stack">
          {error ? <div className="status status-error">{error}</div> : null}
          {message ? <div className="status status-success">{message}</div> : null}
        </div>
      ) : null}

      {activePage === 'submit' ? (
        <section className="compose-panel submit-page-panel">
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

            <div className="image-upload-block">
              <div className="image-upload-heading">
                <div>
                  <span className="field-label">图片</span>
                  <p>可选，最多 {maxIdeaImages} 张，支持 JPG、PNG、WebP，单张不超过 3MB。</p>
                </div>
                <span className="image-count">
                  {selectedImages.length}/{maxIdeaImages}
                </span>
              </div>

              <label className={imageUploadDisabled ? 'file-dropzone file-dropzone-disabled' : 'file-dropzone'} htmlFor="ideaImages">
                <ImagePlus size={20} aria-hidden="true" />
                <span>选择图片</span>
                <input
                  id="ideaImages"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handleImageSelection}
                  disabled={imageUploadDisabled}
                />
              </label>

              {selectedImages.length ? (
                <div className="image-preview-grid" aria-label="已选择图片">
                  {selectedImages.map((image) => (
                    <div className="image-preview" key={image.id}>
                      <img src={image.previewUrl} alt={image.file.name} />
                      <button type="button" onClick={() => removeSelectedImage(image.id)} disabled={savingIdea} aria-label={`移除 ${image.file.name}`}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <button className="button button-primary wide" type="submit" disabled={!participant || savingIdea}>
              {savingIdea ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
              添加到看板
            </button>
          </form>
        </section>
      ) : (
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

            <div className="toolbar-actions">
              <div className="view-toggle" role="group" aria-label="看板视图">
                <button
                  className={boardView === 'card' ? 'view-toggle-button view-toggle-button-active' : 'view-toggle-button'}
                  type="button"
                  onClick={() => setBoardView('card')}
                  aria-pressed={boardView === 'card'}
                >
                  <LayoutGrid size={17} />
                  卡片
                </button>
                <button
                  className={boardView === 'list' ? 'view-toggle-button view-toggle-button-active' : 'view-toggle-button'}
                  type="button"
                  onClick={() => setBoardView('list')}
                  aria-pressed={boardView === 'list'}
                >
                  <List size={17} />
                  列表
                </button>
              </div>

              <button className="button button-secondary" onClick={() => void fetchIdeas(participant)} disabled={loadingBoard}>
                {loadingBoard ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
                刷新
              </button>
            </div>
          </div>

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

          {ideas.length && boardView === 'card' ? (
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
                        <IdeaImageCarousel images={idea.images} title={idea.title} />

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
          ) : null}

          {ideas.length && boardView === 'list' ? (
            <div className="idea-list">
              {sortedIdeas.map((idea) => {
                const isBusy = actionIdeaId === idea.id;

                return (
                  <article className={idea.isMine ? 'idea-list-row idea-list-row-mine' : 'idea-list-row'} key={idea.id}>
                    <div className="idea-list-main">
                      <h3>{idea.title}</h3>
                      <p>{idea.description || '无补充说明'}</p>
                    </div>
                    <div className="idea-list-actions">
                      <div className="vote-count vote-count-compact">
                        <strong>{idea.voteCount}</strong>
                        <span>票</span>
                      </div>
                      <button
                        className={idea.hasMyVote ? 'button button-voted compact-button' : 'button button-primary compact-button'}
                        onClick={() => void toggleVote(idea)}
                        disabled={!participant || isBusy}
                      >
                        {isBusy ? <Loader2 className="spin" size={17} /> : <ThumbsUp size={17} />}
                        {idea.hasMyVote ? '取消' : '投票'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}

export default App;
