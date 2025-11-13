---
date: 2025-11-12T20:41:10+0000
researcher: Claude Code
git_commit: 91f382e80dcc6451856e3597d43cf994bdf57f96
branch: 10x-method
repository: mattermost
topic: "Best way to introduce certain types of tests covering saved posts after decoupling"
tags: [research, testing, saved-posts, decoupling, jest, cypress, playwright, redux]
status: complete
last_updated: 2025-11-12
last_updated_by: Claude Code
---

# Research: Testing Strategy for Saved Posts After Decoupling

**Date**: 2025-11-12T20:41:10+0000
**Researcher**: Claude Code
**Git Commit**: 91f382e80dcc6451856e3597d43cf994bdf57f96
**Branch**: 10x-method
**Repository**: mattermost

## Research Question

What is the best way to introduce tests covering saved posts (flagged posts) functionality after the decoupling refactoring that extracted `PostListCore` and created dedicated containers (`FlaggedPostsContainer`, `PinnedPostsContainer`)?

## Summary

The saved posts decoupling implementation (Phases 1-3) is **complete** but has **significant testing gaps**:

### Critical Findings:
1. **Zero unit tests** exist for the new `FlaggedPostsContainer` and `PinnedPostsContainer` components
2. **Zero unit tests** exist for the shared `PostListCore` component
3. **Strong E2E coverage** exists in Cypress but needs Playwright implementation
4. **Excellent testing infrastructure** is available but underutilized for new containers

### Recommended Testing Approach:
A **layered testing strategy** combining:
- **Unit tests** (Jest + React Testing Library) for component logic and rendering
- **Integration tests** for Redux state management and actions
- **E2E tests** (Playwright) to complement existing Cypress coverage
- **Snapshot tests** for UI regression detection

This strategy ensures comprehensive coverage while leveraging existing infrastructure and patterns.

---

## Detailed Findings

### 1. Current Test Coverage Status

#### New Decoupled Components (Post-Refactoring)

**Components Without Tests:**
- `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.tsx` ❌ **NO TESTS**
- `webapp/channels/src/components/pinned_posts_container/pinned_posts_container.tsx` ❌ **NO TESTS**
- `webapp/channels/src/components/search_results/post_list_core.tsx` ❌ **NO TESTS**

**Implementation Status:**
- ✅ Phase 1: PostListCore extraction - **COMPLETED**
- ✅ Phase 2: FlaggedPostsContainer - **COMPLETED**
- ✅ Phase 3: PinnedPostsContainer - **COMPLETED**
- ⏭️ Phase 4: SearchResultsContainer - **SKIPPED** (SearchResults refactored in Phase 1)
- ⏭️ Phase 5: Cleanup - **SKIPPED** (no cleanup needed)

#### Existing Related Tests

**SearchResults Component Tests:**
- `webapp/channels/src/components/search_results/search_results.test.tsx`
  - **Coverage**: Only tests `arePropsEqual` memoization function (minimal)
  - **Missing**: No component rendering tests, no interaction tests

- `webapp/channels/src/components/search_results/files_filter_menu.test.tsx`
  - **Coverage**: Snapshot tests for filter states
  - **Missing**: No interaction/callback tests

- `webapp/channels/src/components/search_results/messages_or_files_selector.test.tsx`
  - **Coverage**: Snapshot tests for tab selection
  - **Missing**: No interaction tests

- `webapp/channels/src/components/search_results/search_limits_banner.test.tsx`
  - **Coverage**: Comprehensive (378 lines) ✅
  - Tests banner visibility, messages, CTA links, Redux state integration

### 2. Testing Infrastructure Analysis

#### Available Testing Utilities

**Primary Test Utilities:**

1. **`renderWithContext`** - `/Users/psmyrdek/dev/mattermost/webapp/channels/src/tests/react_testing_utils.tsx`
   - Renders components with full Redux/Router/Intl context
   - Returns enhanced result with:
     - `replaceStoreState()` - Replace entire store state
     - `updateStoreState()` - Merge new state
     - `rerender()` - Rerender with new props
     - `store` - Access to test store
   - **Best for**: Modern React Testing Library tests with hooks

2. **`renderHookWithContext`** - Same file
   - Renders hooks with full context
   - **Best for**: Testing custom hooks (e.g., `use_flagged_posts_search.tsx`)

3. **`mockStore`** - `/Users/psmyrdek/dev/mattermost/webapp/channels/src/tests/test_store.tsx`
   - Creates mock Redux store with `redux-mock-store`
   - Returns `store` and `mountOptions` for Enzyme
   - **Best for**: Enzyme-based tests (older pattern)

4. **`TestHelper`** - `/Users/psmyrdek/dev/mattermost/webapp/channels/src/utils/test_helper.ts`
   - Mock data factories:
     - `TestHelper.getPostMock()` - Create mock posts
     - `TestHelper.getUserMock()` - Create mock users
     - `TestHelper.getChannelMock()` - Create mock channels
     - 30+ other mock factories
   - **Best for**: Creating consistent test data

5. **`shallowWithIntl` / `mountWithIntl`** - `/Users/psmyrdek/dev/mattermost/webapp/channels/src/tests/helpers/intl-test-helper.tsx`
   - Enzyme shallow/mount with internationalization
   - **Best for**: Enzyme-based tests with i18n

#### Testing Framework Setup

**Jest Configuration:** `webapp/channels/jest.config.js`
- Test environment: jsdom
- Setup file: `src/tests/setup_jest.ts`
- Snapshot serializer: enzyme-to-json
- Test timeout: 60 seconds
- Coverage: src/**/*.{js,jsx,ts,tsx}

**Key Setup Features:**
- Enzyme + React 18 adapter
- @testing-library/jest-dom matchers
- Global mocks (window, ResizeObserver)
- Console spy to catch warnings/errors
- Custom matcher: `arrayContainingExactly`

### 3. Redux Testing Patterns

#### Pattern 1: Testing with renderWithContext (Modern Approach)

```typescript
import {renderWithContext} from 'tests/react_testing_utils';
import FlaggedPostsContainer from './flagged_posts_container';

test('should display flagged posts', () => {
  const posts = [
    TestHelper.getPostMock({id: 'post1', message: 'Saved post'}),
  ];

  const {getByText} = renderWithContext(
    <FlaggedPostsContainer/>,
    {
      entities: {
        search: {
          flagged: posts.map(p => p.id),
        },
        posts: {
          posts: {post1: posts[0]},
        },
      },
    }
  );

  expect(getByText('Saved post')).toBeInTheDocument();
});
```

#### Pattern 2: Testing State Updates

```typescript
test('should update when new posts are added', () => {
  const {getByText, updateStoreState} = renderWithContext(
    <FlaggedPostsContainer/>,
    initialState,
  );

  // Initially empty
  expect(getByText('No saved messages')).toBeInTheDocument();

  // Add post to state
  updateStoreState({
    entities: {
      search: {
        flagged: ['post1'],
      },
      posts: {
        posts: {
          post1: TestHelper.getPostMock({id: 'post1'}),
        },
      },
    },
  });

  // Verify post appears
  expect(getByText('Saved post')).toBeInTheDocument();
});
```

#### Pattern 3: Testing Actions/Dispatch

```typescript
import * as ReactRedux from 'react-redux';

jest.mock('mattermost-redux/actions/posts', () => ({
  getMoreFlaggedPosts: jest.fn(() => ({type: 'MOCK_GET_MORE'})),
}));

test('should dispatch load more action on scroll', () => {
  const dispatchMock = jest.fn();
  jest.spyOn(ReactRedux, 'useDispatch').mockReturnValue(dispatchMock);

  const {container} = renderWithContext(<FlaggedPostsContainer/>);

  // Simulate scroll to bottom
  fireEvent.scroll(container.querySelector('.scrollbars'), {
    target: {scrollTop: 500, clientHeight: 400, scrollHeight: 900},
  });

  expect(dispatchMock).toHaveBeenCalled();
});
```

#### Pattern 4: Testing Custom Hooks

```typescript
import {renderHookWithContext} from 'tests/react_testing_utils';
import useFlaggedPostsSearch from './use_flagged_posts_search';

test('should search flagged posts', () => {
  const {result} = renderHookWithContext(
    () => useFlaggedPostsSearch(),
    initialState,
  );

  act(() => {
    result.current.search('test query');
  });

  expect(result.current.isSearching).toBe(true);
});
```

### 4. E2E Testing Infrastructure

#### Cypress Coverage (Excellent ✅)

**Main Test File:** `e2e-tests/cypress/tests/integration/channels/messaging/save_post_spec.js`

**Tests:**
- MM-T4948_1: Save via menu → Verify badge → Verify RHS → Unsave
- MM-T4948_2: Save via hotkey (s) → Verify → Unsave via hotkey

**Helper Functions:** `e2e-tests/cypress/tests/support/ui/post.ts`
- `verifySavedPost(postId, message)` - Comprehensive verification:
  - Save icon state (`#CENTER_flagIcon_${postId}`)
  - Dot menu text changes
  - Post highlighting (`post--pinned-or-flagged` class)
  - Post pre-header with saved icon
  - RHS opens with "Saved messages" title
  - Post appears in RHS (`#searchResult_${postId}`)
- `verifyUnsavedPost(postId)` - Reverse verification

**RHS Utilities:** `e2e-tests/cypress/tests/support/ui/sidebar_right.js`
- `uiGetRHS()`, `uiCloseRHS()`, `uiExpandRHS()`
- `uiGetRHSSearchContainer()` - For saved posts container
- `uiGetFileFilterButton()`, `uiOpenFileFilterMenu()`

**Global Header Utilities:** `e2e-tests/cypress/tests/support/ui/global_header.js`
- `uiGetSavedPostButton()` - "Saved messages" button
- `uiGetRecentMentionButton()`, `uiGetSearchBox()`

#### Playwright Coverage (Needs Implementation ⚠️)

**Available Infrastructure:**
- `/Users/psmyrdek/dev/mattermost/e2e-tests/playwright/lib/src/ui/components/channels/sidebar_right.ts`
  - `getPostById()`, `getLastPost()`, `close()`
- `/Users/psmyrdek/dev/mattermost/e2e-tests/playwright/lib/src/ui/components/channels/post_dot_menu.ts`
  - `saveMenuItem`, `removeFromSavedMenuItem`
- `/Users/psmyrdek/dev/mattermost/e2e-tests/playwright/lib/src/ui/components/global_header.ts`
  - `savedMessagesButton`, `recentMentionsButton`

**Missing:**
- No saved posts E2E tests implemented yet
- Infrastructure exists but unused

#### Key DOM Selectors

**Element IDs:**
- `#CENTER_flagIcon_${postId}` - Save icon in center channel
- `#searchContainer` - RHS search/saved posts container
- `#sidebar-right` - Main RHS container
- `#searchResultsCloseButton` - Close RHS button
- `#rhsPostMessageText_${postId}` - Post text in RHS
- `.post--pinned-or-flagged` - Highlighted posts CSS class
- `.sidebar--right__title` - RHS title

**Accessibility Labels:**
- `'save message'` - Save button aria-label
- `'remove from saved'` - Unsave button aria-label
- `'Saved messages'` - Global header button

### 5. Reference Test Examples

#### Excellent Reference: PostList Tests

**File:** `webapp/channels/src/components/post_view/post_list/post_list.test.tsx` (374 lines)

**Coverage:**
- Loading states with no posts
- Pagination (loadOlderPosts, loadNewerPosts)
- Auto-loading vs user scroll behavior
- Different page sizes (30 for scroll, 200 for auto-load)
- Error handling and retry logic
- State management
- Action dispatching

**Pattern Used:** Enzyme shallow with mocked Redux store

**Relevance:** Similar pagination patterns apply to `FlaggedPostsContainer`

---

## Testing Gaps Identified

### Critical Gaps (Priority 1)

1. **FlaggedPostsContainer** - Zero tests
   - Component rendering with posts
   - Empty state handling
   - Loading states (initial + pagination)
   - Scroll-based pagination logic
   - Search functionality (via `use_flagged_posts_search` hook)
   - Redux action dispatching
   - Real-time updates (flag/unflag)

2. **PinnedPostsContainer** - Zero tests
   - Component rendering with posts
   - Empty state handling
   - Loading states
   - No pagination (load all at once)
   - Channel-specific posts
   - Real-time updates (pin/unpin)

3. **PostListCore** - Zero tests
   - Pure component rendering logic
   - Render props invocation
   - Scroll event handling
   - Loading state rendering
   - Empty state rendering
   - List item rendering

### Moderate Gaps (Priority 2)

4. **SearchResults Component** - Minimal tests
   - Only `arePropsEqual` tested
   - No component rendering tests
   - No interaction tests

5. **Custom Hooks** - Not tested
   - `use_flagged_posts_search.tsx` - No tests
   - Search query handling
   - Debouncing
   - State management

6. **Playwright E2E** - Infrastructure ready, tests missing
   - Save/unsave flow
   - RHS navigation
   - Post state indicators
   - Pagination

### Low Priority Gaps (Priority 3)

7. **Integration Tests** - Limited coverage
   - Full flow: Save → RHS → Pagination → Search → Unsave
   - Cross-component integration
   - Performance under load

8. **Visual Regression** - No systematic approach
   - Component snapshots exist but inconsistent
   - No visual diff tooling

---

## Comprehensive Testing Recommendations

### Phase 1: Unit Tests for Core Components (Priority 1)

#### 1.1 FlaggedPostsContainer Tests

**File to Create:** `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.test.tsx`

**Test Coverage:**

```typescript
import {screen, fireEvent, waitFor} from '@testing-library/react';
import {renderWithContext} from 'tests/react_testing_utils';
import {TestHelper} from 'utils/test_helper';
import FlaggedPostsContainer from './flagged_posts_container';

// Mock Redux actions
jest.mock('actions/post_actions', () => ({
  getMoreFlaggedPosts: jest.fn(() => ({type: 'MOCK_GET_MORE'})),
}));

describe('FlaggedPostsContainer', () => {
  const baseState = {
    entities: {
      search: {
        flagged: [],
        isSearchingFlaggedPost: false,
        isGettingMoreFlaggedPosts: false,
        isFlaggedAtEnd: false,
      },
      posts: {
        posts: {},
      },
    },
  };

  describe('rendering', () => {
    test('should show loading state initially', () => {
      renderWithContext(<FlaggedPostsContainer/>, {
        ...baseState,
        entities: {
          ...baseState.entities,
          search: {
            ...baseState.entities.search,
            isSearchingFlaggedPost: true,
          },
        },
      });

      expect(screen.getByText('Searching')).toBeInTheDocument();
    });

    test('should show empty state when no posts', () => {
      renderWithContext(<FlaggedPostsContainer/>, baseState);

      expect(screen.getByText(/no saved messages/i)).toBeInTheDocument();
      expect(screen.getByText('Save Message')).toBeInTheDocument();
    });

    test('should render flagged posts', () => {
      const post = TestHelper.getPostMock({
        id: 'post1',
        message: 'This is saved',
      });

      renderWithContext(<FlaggedPostsContainer/>, {
        entities: {
          search: {
            ...baseState.entities.search,
            flagged: ['post1'],
          },
          posts: {
            posts: {post1: post},
          },
        },
      });

      expect(screen.getByText('This is saved')).toBeInTheDocument();
    });

    test('should display "Saved messages" title', () => {
      renderWithContext(<FlaggedPostsContainer/>, baseState);

      expect(screen.getByText('Saved messages')).toBeInTheDocument();
    });
  });

  describe('pagination', () => {
    test('should load more posts on scroll', async () => {
      const {getMoreFlaggedPosts} = require('actions/post_actions');

      const posts = Array.from({length: 20}, (_, i) =>
        TestHelper.getPostMock({id: `post${i}`, message: `Post ${i}`})
      );

      const {container} = renderWithContext(<FlaggedPostsContainer/>, {
        entities: {
          search: {
            ...baseState.entities.search,
            flagged: posts.map(p => p.id),
          },
          posts: {
            posts: posts.reduce((acc, p) => ({...acc, [p.id]: p}), {}),
          },
        },
      });

      // Scroll to bottom
      const scrollContainer = container.querySelector('.scrollbars');
      fireEvent.scroll(scrollContainer, {
        target: {
          scrollTop: 1000,
          clientHeight: 400,
          scrollHeight: 1400,
        },
      });

      await waitFor(() => {
        expect(getMoreFlaggedPosts).toHaveBeenCalled();
      });
    });

    test('should show loading indicator during pagination', () => {
      renderWithContext(<FlaggedPostsContainer/>, {
        entities: {
          search: {
            ...baseState.entities.search,
            flagged: ['post1'],
            isGettingMoreFlaggedPosts: true,
          },
          posts: {
            posts: {
              post1: TestHelper.getPostMock({id: 'post1'}),
            },
          },
        },
      });

      expect(screen.getByTestId('loading-screen')).toBeInTheDocument();
    });

    test('should not load more when at end', () => {
      const {getMoreFlaggedPosts} = require('actions/post_actions');

      const {container} = renderWithContext(<FlaggedPostsContainer/>, {
        entities: {
          search: {
            ...baseState.entities.search,
            flagged: ['post1'],
            isFlaggedAtEnd: true,
          },
          posts: {
            posts: {post1: TestHelper.getPostMock({id: 'post1'})},
          },
        },
      });

      const scrollContainer = container.querySelector('.scrollbars');
      fireEvent.scroll(scrollContainer, {
        target: {scrollTop: 1000, clientHeight: 400, scrollHeight: 1400},
      });

      expect(getMoreFlaggedPosts).not.toHaveBeenCalled();
    });
  });

  describe('date separators', () => {
    test('should render date separators', () => {
      const today = Date.now();
      const yesterday = today - 86400000;

      const posts = [
        TestHelper.getPostMock({id: 'post1', create_at: today}),
        TestHelper.getPostMock({id: 'post2', create_at: yesterday}),
      ];

      renderWithContext(<FlaggedPostsContainer/>, {
        entities: {
          search: {
            ...baseState.entities.search,
            flagged: posts.map(p => p.id),
          },
          posts: {
            posts: posts.reduce((acc, p) => ({...acc, [p.id]: p}), {}),
          },
        },
      });

      expect(screen.getByText(/Today/i)).toBeInTheDocument();
      expect(screen.getByText(/Yesterday/i)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    test('should have proper ARIA labels', () => {
      const {container} = renderWithContext(<FlaggedPostsContainer/>, baseState);

      const rhsRegion = container.querySelector('[aria-label*="Saved messages"]');
      expect(rhsRegion).toBeInTheDocument();
    });

    test('should have heading with proper id', () => {
      renderWithContext(<FlaggedPostsContainer/>, baseState);

      const heading = screen.getByRole('heading', {name: 'Saved messages'});
      expect(heading).toHaveAttribute('id', 'rhsPanelTitle');
    });
  });
});
```

**Estimated Lines:** ~400-500
**Estimated Time:** 4-6 hours

#### 1.2 PinnedPostsContainer Tests

**File to Create:** `webapp/channels/src/components/pinned_posts_container/pinned_posts_container.test.tsx`

**Similar Structure to FlaggedPostsContainer but with:**
- No pagination tests (loads all at once)
- Channel-specific tests
- Channel display name in header

**Estimated Lines:** ~300-400
**Estimated Time:** 3-4 hours

#### 1.3 PostListCore Tests

**File to Create:** `webapp/channels/src/components/search_results/post_list_core.test.tsx`

**Test Coverage:**

```typescript
import {render} from '@testing-library/react';
import PostListCore from './post_list_core';

describe('PostListCore', () => {
  const mockRenderItem = jest.fn((item) => <div key={item.id}>{item.message}</div>);
  const mockRenderEmpty = jest.fn(() => <div>Empty</div>);
  const mockRenderLoading = jest.fn(() => <div>Loading</div>);
  const mockRenderLoadingMore = jest.fn(() => <div>Loading more</div>);
  const mockOnScroll = jest.fn();
  const mockRef = {current: null};

  const baseProps = {
    items: [],
    renderItem: mockRenderItem,
    renderEmpty: mockRenderEmpty,
    renderLoading: mockRenderLoading,
    renderLoadingMore: mockRenderLoadingMore,
    isLoading: false,
    isLoadingMore: false,
    showLoadMore: false,
    onScroll: mockOnScroll,
    scrollbarRef: mockRef,
    containerClassName: 'test-container',
    ariaLabel: 'Test label',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should render loading state', () => {
    render(<PostListCore {...baseProps} isLoading={true}/>);

    expect(mockRenderLoading).toHaveBeenCalled();
    expect(mockRenderItem).not.toHaveBeenCalled();
  });

  test('should render empty state when no items', () => {
    render(<PostListCore {...baseProps} items={[]}/>);

    expect(mockRenderEmpty).toHaveBeenCalled();
    expect(mockRenderItem).not.toHaveBeenCalled();
  });

  test('should render items', () => {
    const items = [
      {id: '1', message: 'Post 1'},
      {id: '2', message: 'Post 2'},
    ];

    render(<PostListCore {...baseProps} items={items}/>);

    expect(mockRenderItem).toHaveBeenCalledTimes(2);
    expect(mockRenderItem).toHaveBeenCalledWith(items[0], 0);
    expect(mockRenderItem).toHaveBeenCalledWith(items[1], 1);
  });

  test('should render loading more indicator', () => {
    const items = [{id: '1', message: 'Post 1'}];

    render(<PostListCore {...baseProps} items={items} showLoadMore={true}/>);

    expect(mockRenderLoadingMore).toHaveBeenCalled();
  });

  test('should not render loading more when not needed', () => {
    const items = [{id: '1', message: 'Post 1'}];

    render(<PostListCore {...baseProps} items={items} showLoadMore={false}/>);

    expect(mockRenderLoadingMore).not.toHaveBeenCalled();
  });

  test('should apply container class name', () => {
    const {container} = render(<PostListCore {...baseProps} items={[{id: '1', message: 'Test'}]}/>);

    expect(container.querySelector('.test-container')).toBeInTheDocument();
  });

  test('should set aria-label', () => {
    const {container} = render(<PostListCore {...baseProps} items={[{id: '1', message: 'Test'}]}/>);

    expect(container.querySelector('[aria-label="Test label"]')).toBeInTheDocument();
  });

  test('should call onScroll when scrolled', () => {
    const {container} = render(<PostListCore {...baseProps} items={[{id: '1', message: 'Test'}]}/>);

    const scrollContainer = container.querySelector('.scrollbars');
    fireEvent.scroll(scrollContainer);

    expect(mockOnScroll).toHaveBeenCalled();
  });
});
```

**Estimated Lines:** ~200-250
**Estimated Time:** 2-3 hours

### Phase 2: Integration Tests (Priority 2)

#### 2.1 Custom Hook Tests

**File to Create:** `webapp/channels/src/components/flagged_posts_container/use_flagged_posts_search.test.ts`

```typescript
import {renderHookWithContext} from 'tests/react_testing_utils';
import {act} from '@testing-library/react';
import useFlaggedPostsSearch from './use_flagged_posts_search';

describe('useFlaggedPostsSearch', () => {
  test('should initialize with empty query', () => {
    const {result} = renderHookWithContext(() => useFlaggedPostsSearch());

    expect(result.current.query).toBe('');
    expect(result.current.isSearching).toBe(false);
  });

  test('should update query', () => {
    const {result} = renderHookWithContext(() => useFlaggedPostsSearch());

    act(() => {
      result.current.setQuery('test query');
    });

    expect(result.current.query).toBe('test query');
  });

  test('should debounce search', async () => {
    jest.useFakeTimers();
    const {result} = renderHookWithContext(() => useFlaggedPostsSearch());

    act(() => {
      result.current.setQuery('test');
    });

    expect(result.current.isSearching).toBe(false);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current.isSearching).toBe(true);

    jest.useRealTimers();
  });
});
```

**Estimated Lines:** ~100-150
**Estimated Time:** 1-2 hours

#### 2.2 Selector Tests

**File to Create:** `webapp/channels/src/selectors/rhs_saved_posts.test.ts` (if new selectors added)

Test Redux selectors for saved posts if any custom ones were created.

### Phase 3: E2E Tests (Priority 2)

#### 3.1 Playwright Saved Posts Tests

**File to Create:** `e2e-tests/playwright/specs/functional/channels/saved_posts/saved_posts.spec.ts`

```typescript
import {expect, test} from '@e2e-support/test_fixture';

test.describe('Saved Posts', () => {
  test('should save and unsave a post', async ({pages}) => {
    const {page, user} = pages;

    // Navigate to channel and post message
    await page.goto('/');
    await page.channels.postMessage('Test message to save');

    // Get the post
    const post = await page.channels.getLastPost();

    // Save the post via hover menu
    await post.hover();
    await post.saveButton.click();

    // Verify saved indicator
    await expect(post.savedIcon).toBeVisible();

    // Open saved posts via global header
    await page.globalHeader.savedMessagesButton.click();

    // Verify post appears in RHS
    await expect(page.sidebarRight.container).toBeVisible();
    await expect(page.sidebarRight.toContainText('Test message to save')).toBe(true);

    // Unsave via RHS
    const rhsPost = await page.sidebarRight.getPostById(post.id);
    await rhsPost.hover();
    await rhsPost.dotMenuButton.click();
    await rhsPost.dotMenu.removeFromSavedMenuItem.click();

    // Verify post removed from RHS
    await expect(rhsPost.container).not.toBeVisible();
  });

  test('should paginate saved posts', async ({pages}) => {
    const {page} = pages;

    // Create 40 saved posts
    for (let i = 0; i < 40; i++) {
      await page.channels.postMessage(`Saved post ${i}`);
      const post = await page.channels.getLastPost();
      await post.hover();
      await post.saveButton.click();
    }

    // Open saved posts
    await page.globalHeader.savedMessagesButton.click();

    // Verify initial posts loaded
    const posts = await page.sidebarRight.getAllPosts();
    expect(posts.length).toBe(30); // First page

    // Scroll to bottom to trigger pagination
    await page.sidebarRight.scrollToBottom();

    // Wait for more posts to load
    await page.waitForTimeout(500);

    // Verify more posts loaded
    const morePosts = await page.sidebarRight.getAllPosts();
    expect(morePosts.length).toBe(40);
  });

  test('should search within saved posts', async ({pages}) => {
    const {page} = pages;

    // Create saved posts with different content
    await page.channels.postMessage('Apple pie recipe');
    await page.channels.getLastPost().save();

    await page.channels.postMessage('Banana bread recipe');
    await page.channels.getLastPost().save();

    // Open saved posts
    await page.globalHeader.savedMessagesButton.click();

    // Search for specific post
    await page.sidebarRight.searchBox.fill('banana');

    // Verify only matching post shown
    await expect(page.sidebarRight.toContainText('Banana bread')).toBe(true);
    await expect(page.sidebarRight.toContainText('Apple pie')).toBe(false);
  });

  test('should show empty state when no saved posts', async ({pages}) => {
    const {page} = pages;

    // Open saved posts without saving any
    await page.globalHeader.savedMessagesButton.click();

    // Verify empty state
    await expect(page.sidebarRight.toContainText('No saved messages')).toBe(true);
    await expect(page.sidebarRight.toContainText('Save Message')).toBe(true);
  });
});
```

**Estimated Lines:** ~200-300
**Estimated Time:** 4-6 hours (including page object updates)

### Phase 4: Snapshot Tests (Priority 3)

#### 4.1 Component Snapshot Tests

Add snapshot tests to each unit test file for UI regression detection:

```typescript
test('should match snapshot - empty state', () => {
  const {container} = renderWithContext(<FlaggedPostsContainer/>, baseState);
  expect(container).toMatchSnapshot();
});

test('should match snapshot - with posts', () => {
  const {container} = renderWithContext(<FlaggedPostsContainer/>, stateWithPosts);
  expect(container).toMatchSnapshot();
});

test('should match snapshot - loading state', () => {
  const {container} = renderWithContext(<FlaggedPostsContainer/>, loadingState);
  expect(container).toMatchSnapshot();
});
```

---

## Implementation Roadmap

### Week 1: Critical Unit Tests
- **Day 1-2**: FlaggedPostsContainer tests (400 lines)
- **Day 3**: PinnedPostsContainer tests (350 lines)
- **Day 4**: PostListCore tests (200 lines)
- **Day 5**: Hook tests + Buffer

**Deliverable:** ~950 lines of unit tests, 90% component coverage

### Week 2: Integration & E2E
- **Day 1-2**: Selector tests + Redux integration tests
- **Day 3-5**: Playwright E2E tests (300 lines)

**Deliverable:** Full test coverage, CI/CD integration

### Week 3: Polish & Documentation
- **Day 1-2**: Snapshot tests + Visual regression setup
- **Day 3**: Test documentation + README updates
- **Day 4-5**: Performance testing + Load testing

**Deliverable:** Production-ready test suite

---

## Testing Best Practices

### 1. Test Organization

**Structure:**
```
component.test.tsx
├── describe('ComponentName')
│   ├── describe('rendering')
│   │   ├── test('should render X')
│   │   └── test('should show Y when Z')
│   ├── describe('interactions')
│   │   └── test('should call X when Y clicked')
│   ├── describe('state management')
│   │   └── test('should update when state changes')
│   └── describe('accessibility')
│       └── test('should have proper ARIA labels')
```

### 2. Naming Conventions

- Use descriptive test names: `'should load more posts on scroll'` ✅
- Avoid generic names: `'works'` ❌
- Use `describe` blocks to group related tests
- Use consistent patterns across test files

### 3. Mock Management

**Best Practices:**
- Mock at module level, not function level
- Clear mocks between tests (`jest.clearAllMocks()`)
- Use `jest.spyOn` for partial mocks
- Mock external dependencies, not internal logic

**Example:**
```typescript
// Good: Mock at module level
jest.mock('actions/post_actions', () => ({
  getMoreFlaggedPosts: jest.fn(() => ({type: 'MOCK'})),
}));

// Bad: Mock inside test
test('test', () => {
  const getMoreFlaggedPosts = jest.fn();
  // ...
});
```

### 4. Test Data Management

**Use TestHelper consistently:**
```typescript
// Good: Use TestHelper
const post = TestHelper.getPostMock({id: 'post1', message: 'Test'});

// Bad: Manual object creation
const post = {
  id: 'post1',
  message: 'Test',
  // Missing 30+ required fields
};
```

### 5. Async Testing

**Handle async operations properly:**
```typescript
// Good: Use waitFor
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});

// Bad: No wait
expect(screen.getByText('Loaded')).toBeInTheDocument();
```

### 6. Accessibility Testing

**Include a11y checks:**
```typescript
describe('accessibility', () => {
  test('should have proper ARIA labels', () => {
    const {container} = renderWithContext(<Component/>);
    expect(container.querySelector('[aria-label="Saved messages"]')).toBeInTheDocument();
  });

  test('should have heading with correct level', () => {
    renderWithContext(<Component/>);
    expect(screen.getByRole('heading', {level: 2, name: 'Saved messages'})).toBeInTheDocument();
  });
});
```

---

## Code References

### Components to Test
- `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.tsx:575` - Main container
- `webapp/channels/src/components/pinned_posts_container/pinned_posts_container.tsx:1020` - Pinned container
- `webapp/channels/src/components/search_results/post_list_core.tsx:777` - Core list component
- `webapp/channels/src/components/flagged_posts_container/use_flagged_posts_search.tsx` - Search hook

### Testing Utilities
- `webapp/channels/src/tests/react_testing_utils.tsx:48` - `renderWithContext`
- `webapp/channels/src/tests/react_testing_utils.tsx:162` - `renderHookWithContext`
- `webapp/channels/src/tests/test_store.tsx:15` - `mockStore`
- `webapp/channels/src/utils/test_helper.ts:43` - `TestHelper`

### Reference Tests
- `webapp/channels/src/components/post_view/post_list/post_list.test.tsx:1` - Excellent pagination example
- `webapp/channels/src/components/search_results/search_limits_banner.test.tsx:1` - Redux integration example
- `e2e-tests/cypress/tests/integration/channels/messaging/save_post_spec.js:1` - E2E patterns

### Selectors & Actions
- `webapp/channels/src/selectors/rhs.ts:1` - RHS selectors
- `webapp/channels/src/actions/post_actions.ts:101` - Flag/unflag actions

### E2E Utilities
- `e2e-tests/cypress/tests/support/ui/post.ts:1` - Post helpers
- `e2e-tests/cypress/tests/support/ui/sidebar_right.js:1` - RHS helpers
- `e2e-tests/playwright/lib/src/ui/components/channels/sidebar_right.ts:1` - Playwright RHS

---

## Related Research

- `thoughts/shared/plans/2025-11-11-saved-posts-decoupling-implementation.md` - Implementation plan
- `thoughts/shared/research/2025-11-11-saved-posts-decoupling.md` - Original research (if exists)

---

## Open Questions

1. **Performance Testing**: Should we add performance benchmarks for pagination? (e.g., time to load 1000 posts)
2. **Visual Regression**: Should we integrate Percy or Chromatic for visual diff testing?
3. **Test Coverage Target**: What's the acceptable coverage percentage? (Recommendation: 80%+ for new code)
4. **CI/CD Integration**: Should new tests run on every PR or only on specific paths?
5. **Flaky Test Handling**: What's the retry policy for E2E tests in CI?

---

## Metrics & Success Criteria

### Test Coverage Targets
- **Unit Tests**: 90%+ coverage for new components
- **Integration Tests**: All Redux flows tested
- **E2E Tests**: Critical user paths covered (save, unsave, pagination, search)

### Quality Gates
- All tests pass locally before PR
- No console errors/warnings during tests
- Test execution time < 30 seconds for unit tests
- E2E tests stable (< 5% flaky rate)

### Maintenance
- Update tests when component logic changes
- Keep test data factories (TestHelper) updated
- Document test patterns in component README
- Review test coverage in code reviews

---

## Conclusion

The saved posts decoupling implementation is **functionally complete** but **critically undertested**. The recommended layered testing strategy provides:

1. **Fast feedback** via unit tests (< 30 sec)
2. **Confidence** via integration tests
3. **User journey validation** via E2E tests
4. **Regression protection** via snapshots

**Estimated Total Effort**: 2-3 weeks for comprehensive test coverage

**Recommended Priority**: Start with Phase 1 (unit tests) immediately, as these provide the highest ROI and can catch regressions early.

**Key Success Factor**: Use existing testing infrastructure (`renderWithContext`, `TestHelper`) to maintain consistency with the codebase's testing patterns.

---

# APPENDIX: Scroll-Based Pagination Testing Patterns in Mattermost Webapp

**Research Date:** 2025-11-12 (Updated)
**Objective:** Extract specific testing patterns for scroll-based pagination from the Mattermost codebase

---

## Overview

The Mattermost webapp uses **Enzyme** for testing scroll-based pagination in virtualized lists. The primary test file is `/webapp/channels/src/components/post_view/post_list/post_list.test.tsx` which demonstrates comprehensive patterns for testing:

- Load more actions (older/newer posts)
- Loading state verification
- "At end" state testing
- Action dispatch verification
- Scroll event handling

---

## Test File Structure

### Base Test Setup (Lines 13-50)

**File:** `/Users/psmyrdek/dev/mattermost/webapp/channels/src/components/post_view/post_list/post_list.test.tsx`

```tsx
// Mock action functions with jest.fn()
const actionsProp = {
    loadPostsAround: jest.fn().mockImplementation(() => Promise.resolve({atLatestMessage: true, atOldestmessage: true})),
    loadUnreads: jest.fn().mockImplementation(() => Promise.resolve({atLatestMessage: true, atOldestmessage: true})),
    loadPosts: jest.fn().mockImplementation(() => Promise.resolve({moreToLoad: false})),
    syncPostsInChannel: jest.fn().mockResolvedValue({}),
    loadLatestPosts: jest.fn().mockImplementation(() => Promise.resolve({atLatestMessage: true, atOldestmessage: true})),
    markChannelAsRead: jest.fn(),
    updateNewMessagesAtInChannel: jest.fn(),
    toggleShouldStartFromBottomWhenUnread: jest.fn(),
};

const baseProps = {
    actions: actionsProp,
    lastViewedAt: 1532345226632,
    channelId: 'fake-id',
    postListIds: [],
    changeUnreadChunkTimeStamp: jest.fn(),
    toggleShouldStartFromBottomWhenUnread: jest.fn(),
    isFirstLoad: true,
    atLatestPost: false,
    formattedPostIds: [],
    isPrefetchingInProcess: false,
    isMobileView: false,
    hasInaccessiblePosts: false,
    shouldStartFromBottomWhenUnread: false,
};
```

**Key Pattern:** Mock actions with `jest.fn().mockImplementation()` returning Promises that resolve with pagination metadata like `{moreToLoad: false}` or `{atLatestMessage: true}`.

---

## Pattern 1: Testing Load More Actions

### Load Older Posts (Lines 89-106)

```tsx
it('Should call for before and afterPosts', async () => {
    const postIds = createFakePosIds(2);
    const wrapper = shallow<PostList>(
        <PostList {...{...baseProps, postListIds: postIds}}/>,
    );

    // Trigger load older posts by calling the action prop
    wrapper.find(VirtPostList).prop('actions').loadOlderPosts();

    // Verify loading state is set
    expect(wrapper.state('loadingOlderPosts')).toEqual(true);

    // Verify the action was called with correct parameters
    expect(actionsProp.loadPosts).toHaveBeenCalledWith({
        channelId: baseProps.channelId,
        postId: postIds[postIds.length - 1],
        type: PostRequestTypes.BEFORE_ID,
        perPage: 30
    });

    // Wait for async operation to complete
    await wrapper.instance().callLoadPosts('undefined', 'undefined', undefined, 30);

    // Verify loading state is cleared
    expect(wrapper.state('loadingOlderPosts')).toBe(false);
});
```

### Load Newer Posts (Lines 101-106)

```tsx
// Trigger load newer posts
wrapper.find(VirtPostList).prop('actions').loadNewerPosts();

// Verify loading state
expect(wrapper.state('loadingNewerPosts')).toEqual(true);

// Verify action dispatch
expect(actionsProp.loadPosts).toHaveBeenCalledWith({
    channelId: baseProps.channelId,
    postId: postIds[0],
    type: PostRequestTypes.AFTER_ID,
    perPage: 30
});

await wrapper.instance().callLoadPosts('undefined', 'undefined', undefined, 30);
expect(wrapper.state('loadingNewerPosts')).toBe(false);
```

**Key Takeaways:**
- Use `wrapper.find(ChildComponent).prop('actions').actionName()` to trigger actions
- Check `wrapper.state('loadingNewerPosts')` and `wrapper.state('loadingOlderPosts')` for loading states
- Use `await wrapper.instance().methodName()` to wait for async operations
- Verify action calls with `expect(mockAction).toHaveBeenCalledWith({...params})`

---

## Pattern 2: Testing "At End" State

### At Oldest Post (Lines 190-196)

```tsx
test('Should call getPostsBefore if not all older posts are loaded', async () => {
    const postIds = createFakePosIds(2);
    const wrapper = shallow(<PostList {...{...baseProps, isFirstLoad: false, postListIds: postIds}}/>);

    // Set "not at oldest" state
    wrapper.setProps({atOldestPost: false});

    // Trigger auto-load
    wrapper.find(VirtPostList).prop('actions').canLoadMorePosts(undefined);

    // Verify it calls loadPosts with BEFORE_ID
    expect(actionsProp.loadPosts).toHaveBeenCalledWith({
        channelId: baseProps.channelId,
        postId: postIds[postIds.length - 1],
        type: PostRequestTypes.BEFORE_ID,
        perPage: 200
    });
});
```

### At Latest Post (Lines 198-204)

```tsx
test('Should call getPostsAfter if all older posts are loaded and not newerPosts', async () => {
    const postIds = createFakePosIds(2);
    const wrapper = shallow(<PostList {...{...baseProps, isFirstLoad: false, postListIds: postIds}}/>);

    // Set "at oldest" state so it loads newer posts instead
    wrapper.setProps({atOldestPost: true});

    wrapper.find(VirtPostList).prop('actions').canLoadMorePosts(undefined);

    // Verify it calls loadPosts with AFTER_ID
    expect(actionsProp.loadPosts).toHaveBeenCalledWith({
        channelId: baseProps.channelId,
        postId: postIds[0],
        type: PostRequestTypes.AFTER_ID,
        perPage: 30
    });
});
```

**Key Takeaways:**
- Use `wrapper.setProps({atOldestPost: false/true})` to simulate "at end" states
- Test that the component correctly switches between loading older vs newer posts
- Verify different `perPage` values (200 for auto-load vs 30 for user scroll)

---

## Pattern 3: Preventing Unnecessary Loads

### Loading State Check (Lines 170-180)

```tsx
test('Should not call loadPosts if olderPosts or newerPosts are loading', async () => {
    const postIds = createFakePosIds(2);
    const wrapper = shallow(<PostList {...{...baseProps, isFirstLoad: false, postListIds: postIds}}/>);

    // Set loading state manually
    wrapper.setState({loadingOlderPosts: true});
    wrapper.find(VirtPostList).prop('actions').canLoadMorePosts(undefined);

    // Verify no action was dispatched
    expect(actionsProp.loadPosts).not.toHaveBeenCalled();

    // Test for newer posts loading
    wrapper.setState({loadingOlderPosts: false});
    wrapper.setState({loadingNewerPosts: true});
    wrapper.find(VirtPostList).prop('actions').canLoadMorePosts(undefined);
    expect(actionsProp.loadPosts).not.toHaveBeenCalled();
});
```

### Max Pages Loaded Check (Lines 182-188)

```tsx
test('Should not call loadPosts if there were more than MAX_EXTRA_PAGES_LOADED', async () => {
    const postIds = createFakePosIds(2);
    const wrapper = shallow<PostList>(<PostList {...{...baseProps, isFirstLoad: false, postListIds: postIds}}/>);

    // Set instance property directly
    wrapper.instance().extraPagesLoaded = MAX_EXTRA_PAGES_LOADED + 1;

    wrapper.find(VirtPostList).prop('actions').canLoadMorePosts(undefined);
    expect(actionsProp.loadPosts).not.toHaveBeenCalled();
});
```

**Key Takeaways:**
- Use `wrapper.setState({loadingOlderPosts: true})` to simulate loading states
- Use `wrapper.instance().propertyName = value` to set instance properties
- Test that loads are prevented when already loading or at limits
- Use `.not.toHaveBeenCalled()` to verify actions weren't dispatched

---

## Pattern 4: Auto-Retry Logic

### Retry on Failure (Lines 214-239)

```tsx
test('Should retry loadPosts on failure of loadPosts', async () => {
    const postIds = createFakePosIds(2);

    // Mock loadPosts to return an error
    const loadPosts = jest.fn().mockImplementation(() =>
        Promise.resolve({moreToLoad: true, error: {}})
    );

    const props = {
        ...baseProps,
        postListIds: postIds,
        actions: {
            ...actionsProp,
            loadPosts,
        },
    };

    const wrapper = shallow(<PostList {...props}/>);

    wrapper.find(VirtPostList).prop('actions').loadOlderPosts();

    // Verify loading state
    expect(wrapper.state('loadingOlderPosts')).toEqual(true);

    // Verify first call
    expect(loadPosts).toHaveBeenCalledTimes(1);
    expect(loadPosts).toHaveBeenCalledWith({
        channelId: baseProps.channelId,
        postId: postIds[postIds.length - 1],
        type: PostRequestTypes.BEFORE_ID,
        perPage: 30
    });

    // Wait for retry logic
    await loadPosts();

    expect(wrapper.state('loadingOlderPosts')).toBe(false);

    // Verify it retried (called 3 times total)
    expect(loadPosts).toHaveBeenCalledTimes(3);
});
```

**Key Takeaways:**
- Mock actions to return `{moreToLoad: true, error: {}}` to simulate failures
- Use `expect(mockFn).toHaveBeenCalledTimes(n)` to verify retry attempts
- Use `await mockFn()` to wait for async retry logic

---

## Pattern 5: Differentiated Page Sizes

### User Scroll vs Auto-Load (Lines 264-318)

```tsx
test('Should use 30 posts for user scroll (getPostsBefore)', async () => {
    const postIds = createFakePosIds(2);
    const loadPosts = jest.fn().mockImplementation(() => Promise.resolve({moreToLoad: true}));

    const props = {
        ...baseProps,
        postListIds: postIds,
        actions: {
            ...actionsProp,
            loadPosts,
        },
    };

    const wrapper = shallow(<PostList {...props}/>);

    // Trigger user scroll up
    wrapper.find(VirtPostList).prop('actions').loadOlderPosts();

    expect(loadPosts).toHaveBeenCalledWith({
        channelId: baseProps.channelId,
        postId: postIds[postIds.length - 1],
        type: PostRequestTypes.BEFORE_ID,
        perPage: 30,  // USER_SCROLL_POSTS_PER_PAGE
    });
});

test('Should use 200 posts for auto-loading (getPostsBeforeAutoLoad)', async () => {
    const postIds = createFakePosIds(2);
    const loadPosts = jest.fn().mockImplementation(() => Promise.resolve({moreToLoad: true}));

    const props = {
        ...baseProps,
        postListIds: postIds,
        atOldestPost: false,
        actions: {
            ...actionsProp,
            loadPosts,
        },
    };

    const wrapper = shallow(<PostList {...props}/>);

    // Trigger auto-loading via canLoadMorePosts
    await wrapper.find(VirtPostList).prop('actions').canLoadMorePosts(PostRequestTypes.BEFORE_ID);

    expect(loadPosts).toHaveBeenCalledWith({
        channelId: baseProps.channelId,
        postId: postIds[postIds.length - 1],
        type: PostRequestTypes.BEFORE_ID,
        perPage: 200, // AUTO_LOAD_POSTS_PER_PAGE
    });
});
```

**Key Takeaways:**
- Test different page sizes for user-initiated vs automatic loading
- User scroll: 30 posts (`loadOlderPosts()` / `loadNewerPosts()`)
- Auto-load: 200 posts (`canLoadMorePosts()`)
- Verify the correct `perPage` parameter in action calls

---

## Scroll Event Simulation (Virtualized List)

**File:** `/Users/psmyrdek/dev/mattermost/webapp/channels/src/components/post_view/post_list_virtualized/post_list_virtualized.test.tsx`

### Scroll Properties Setup (Lines 107-124)

```tsx
describe('onScroll', () => {
    test('should call checkBottom', () => {
        const wrapper = shallow<PostList>(<PostList {...baseProps}/>);
        wrapper.instance().checkBottom = jest.fn();

        // Define scroll properties
        const scrollOffset = 1234;
        const scrollHeight = 1000;
        const clientHeight = 500;

        // Simulate scroll event by calling onScroll directly
        wrapper.instance().onScroll({
            scrollDirection: 'forward',
            scrollOffset,
            scrollUpdateWasRequested: false,
            scrollHeight,
            clientHeight,
        });

        expect(wrapper.instance().checkBottom).toHaveBeenCalledWith(
            scrollOffset,
            scrollHeight,
            clientHeight
        );
    });
});
```

### Testing "At Bottom" Detection (Lines 326-357)

```tsx
describe('isAtBottom', () => {
    const scrollHeight = 1000;
    const clientHeight = 500;

    for (const testCase of [
        {
            name: 'when viewing the top of the post list',
            scrollOffset: 0,
            expected: false,
        },
        {
            name: 'when 11 pixel from the bottom',
            scrollOffset: 489,
            expected: false,
        },
        {
            name: 'when 9 pixel from the bottom also considered to be bottom',
            scrollOffset: 490,
            expected: true,
        },
        {
            name: 'when clientHeight is less than scrollHeight',
            scrollOffset: 501,
            expected: true,
        },
    ]) {
        test(testCase.name, () => {
            const wrapper = shallow<PostList>(<PostList {...baseProps}/>);
            expect(wrapper.instance().isAtBottom(
                testCase.scrollOffset,
                scrollHeight,
                clientHeight
            )).toBe(testCase.expected);
        });
    }
});
```

**Key Takeaways:**
- **No fireEvent.scroll**: Mattermost doesn't use `fireEvent.scroll` from React Testing Library
- Instead, they call `wrapper.instance().onScroll()` directly with scroll parameters
- Scroll parameters:
  - `scrollOffset`: Current scroll position (top-relative)
  - `scrollHeight`: Total scrollable height
  - `clientHeight`: Visible viewport height
  - `scrollDirection`: 'forward' or 'backward'
  - `scrollUpdateWasRequested`: Whether scroll was programmatic
- Test "at bottom" logic with formula: `scrollOffset + clientHeight >= scrollHeight - BUFFER`

### Triggering Auto-Load on Scroll (Lines 127-145)

```tsx
test('should call canLoadMorePosts with AFTER_ID if loader is visible', () => {
    const wrapper = shallow<PostList>(<PostList {...baseProps}/>);
    const instance = wrapper.instance();

    const scrollOffset = 1234;
    const scrollHeight = 1000;
    const clientHeight = 500;

    // Mock the list ref to simulate loader being visible
    instance.listRef = {
        current: {
            _getRangeToRender: () => [0, 70, 12, 1]
        } as unknown as DynamicVirtualizedList
    };

    instance.onScroll({
        scrollDirection: 'forward',
        scrollOffset,
        scrollUpdateWasRequested: true,
        scrollHeight,
        clientHeight,
    });

    expect(baseProps.actions.canLoadMorePosts).toHaveBeenCalledWith(PostRequestTypes.AFTER_ID);
});
```

**Key Takeaways:**
- Mock `listRef.current._getRangeToRender()` to simulate which items are visible
- Set `scrollUpdateWasRequested: true` for programmatic scrolls
- Test that auto-load triggers when loader element becomes visible

---

## Scroll Correction on New Content (Lines 402-437)

```tsx
describe('Scroll correction logic on mount of posts at the top', () => {
    test('should return previous scroll position from getSnapshotBeforeUpdate', () => {
        const wrapper = shallow<PostList>(<PostList {...baseProps}/>);
        const instance = wrapper.instance();
        instance.componentDidUpdate = jest.fn();

        // Mock the DOM ref with scroll properties
        instance.postListRef = {
            current: {
                scrollHeight: 100,
                parentElement: {scrollTop: 10}
            } as unknown as HTMLDivElement
        };

        wrapper.setState({atBottom: false});
        wrapper.setProps({atOldestPost: true});

        expect(instance.componentDidUpdate).toHaveBeenCalledTimes(2);
        expect((instance.componentDidUpdate as jest.Mock).mock.calls[1][2]).toEqual({
            previousScrollTop: 10,
            previousScrollHeight: 100
        });

        // Simulate new posts added (scrollHeight increases)
        instance.postListRef = {
            current: {
                scrollHeight: 200,
                parentElement: {scrollTop: 30}
            } as unknown as HTMLDivElement
        };

        wrapper.setProps({
            postListIds: [
                'post1', 'post2', 'post3',
                DATE_LINE + 1551711600000,
                'post4',
            ]
        });

        expect(instance.componentDidUpdate).toHaveBeenCalledTimes(3);
        expect((instance.componentDidUpdate as jest.Mock).mock.calls[2][2]).toEqual({
            previousScrollTop: 30,
            previousScrollHeight: 200
        });
    });
});
```

**Key Takeaways:**
- Mock `postListRef.current.scrollHeight` and `postListRef.current.parentElement.scrollTop`
- Test scroll correction by checking `getSnapshotBeforeUpdate` return values
- Verify `componentDidUpdate` receives correct snapshot data
- Use `(instance.method as jest.Mock).mock.calls[n][argIndex]` to inspect call arguments

---

## Sidebar List Scroll Testing

**File:** `/Users/psmyrdek/dev/mattermost/webapp/channels/src/components/sidebar/sidebar_list/sidebar_list.test.tsx`

### Unread Indicators (Lines 163-191)

```tsx
test('should display unread scroll indicator when channels appear outside visible area', () => {
    const wrapper = shallowWithIntl(<SidebarList {...baseProps}/>);
    const instance = wrapper.instance() as SidebarListComponent;

    // Mock scrollbar ref with scroll properties
    instance.scrollbar = {
        current: {
            scrollTop: 0,
            clientHeight: 500,
        } as any,
    };

    // Mock channel position (above viewport)
    instance.channelRefs.set(unreadChannel.id, {
        offsetTop: 1,
        offsetHeight: 0,
    } as any);

    instance.updateUnreadIndicators();
    expect(instance.state.showTopUnread).toBe(true);

    // Mock channel position (below viewport)
    instance.channelRefs.set(unreadChannel.id, {
        offsetTop: 501,  // scrollTop + clientHeight = 500, so 501 is below
        offsetHeight: 0,
    } as any);

    instance.updateUnreadIndicators();
    expect(instance.state.showBottomUnread).toBe(true);
});
```

### Scrolling to Channel (Lines 193-216)

```tsx
test('should scroll to correct position when scrolling to channel', () => {
    const wrapper = shallowWithIntl(<SidebarList {...baseProps}/>);
    const instance = wrapper.instance() as SidebarListComponent;

    instance.scrollToPosition = jest.fn();

    // Mock scrollbar with current position
    instance.scrollbar = {
        current: {
            scrollTo: jest.fn(),
            scrollTop: 100,
            clientHeight: 500,
        } as any,
    };

    // Mock channel ref position
    instance.channelRefs.set(unreadChannel.id, {
        offsetTop: 50,
        offsetHeight: 20,
    } as any);

    instance.scrollToChannel(unreadChannel.id);

    // Verify scrollToPosition called with adjusted offset
    expect(instance.scrollToPosition).toBeCalledWith(8); // includes margin and category header height
});
```

**Key Takeaways:**
- Mock `scrollbar.current.scrollTop` and `scrollbar.current.clientHeight` for viewport
- Mock `channelRefs` with `offsetTop` and `offsetHeight` for element positions
- Test visibility calculations: `offsetTop < scrollTop` (above) or `offsetTop > scrollTop + clientHeight` (below)
- Mock `scrollTo` and `scrollToPosition` methods to verify scroll actions

---

## Helper Utilities

### Creating Test Data (Lines 27-34)

```tsx
const createFakePosIds = (num: number) => {
    const postIds = [];
    for (let i = 1; i <= num; i++) {
        postIds.push(`1234${i}`);
    }
    return postIds;
};
```

### Constants for Testing

```tsx
// From post_list.tsx
const MAX_EXTRA_PAGES_LOADED = 10;

// From utils/constants
const PostRequestTypes = {
    BEFORE_ID: 'before_id',
    AFTER_ID: 'after_id',
};

const PostListRowListIds = {
    LOAD_OLDER_MESSAGES_TRIGGER: 'load_older_messages_trigger',
    LOAD_NEWER_MESSAGES_TRIGGER: 'load_newer_messages_trigger',
    OLDER_MESSAGES_LOADER: 'older_messages_loader',
    NEWER_MESSAGES_LOADER: 'newer_messages_loader',
    CHANNEL_INTRO_MESSAGE: 'channel_intro_message',
    START_OF_NEW_MESSAGES: 'start_of_new_messages_',
    DATE_LINE: 'date_line_',
};
```

---

## Summary of Testing Patterns

### 1. **Mock Actions**
```tsx
const mockAction = jest.fn().mockImplementation(() => Promise.resolve({moreToLoad: false}));
```

### 2. **Access Child Component Props**
```tsx
wrapper.find(ChildComponent).prop('actions').actionName();
```

### 3. **Check Loading State**
```tsx
expect(wrapper.state('loadingOlderPosts')).toBe(true);
```

### 4. **Verify Action Dispatch**
```tsx
expect(mockAction).toHaveBeenCalledWith({...expectedParams});
expect(mockAction).toHaveBeenCalledTimes(3);
expect(mockAction).not.toHaveBeenCalled();
```

### 5. **Simulate "At End" States**
```tsx
wrapper.setProps({atOldestPost: false});
wrapper.setProps({atLatestPost: true});
```

### 6. **Set Component State**
```tsx
wrapper.setState({loadingOlderPosts: true});
```

### 7. **Set Instance Properties**
```tsx
wrapper.instance().extraPagesLoaded = MAX_EXTRA_PAGES_LOADED + 1;
wrapper.instance().listRef = {current: {...mockRef}};
```

### 8. **Simulate Scroll Events**
```tsx
wrapper.instance().onScroll({
    scrollDirection: 'forward',
    scrollOffset: 1234,
    scrollHeight: 1000,
    clientHeight: 500,
    scrollUpdateWasRequested: false,
});
```

### 9. **Mock DOM Refs**
```tsx
instance.postListRef = {
    current: {
        scrollHeight: 100,
        parentElement: {scrollTop: 10}
    } as unknown as HTMLDivElement
};
```

### 10. **Wait for Async Operations**
```tsx
await wrapper.instance().methodName();
await mockAction();
```

---

## Key Differences from React Testing Library

1. **No `fireEvent.scroll`**: Directly call `instance.onScroll()` with parameters
2. **No `getByRole` or queries**: Use `wrapper.find(Component)` and `.prop()`
3. **Direct state access**: Use `wrapper.state('stateName')` instead of asserting on rendered output
4. **Instance access**: Use `wrapper.instance()` to call methods and set properties
5. **Shallow rendering**: Only renders one level deep, mocking child components

---

## Recommendations for Saved Posts Testing

Based on these patterns, for testing saved posts pagination:

1. **Mock the `loadSavedPosts` action** with `jest.fn().mockImplementation(() => Promise.resolve({hasMore: false}))`

2. **Test loading states** by checking `wrapper.state('loading')` before and after actions

3. **Test "at end" state** by setting `wrapper.setProps({hasMore: false})` and verifying no more loads occur

4. **Verify dispatch calls** with `expect(mockAction).toHaveBeenCalledWith({page: 2, perPage: 30})`

5. **Simulate scroll** by calling `wrapper.instance().handleScroll()` with mock scroll parameters

6. **Test scroll detection** with different `scrollTop + clientHeight` values relative to `scrollHeight`

7. **Prevent duplicate loads** by testing that actions aren't called when `loading: true`

8. **Test auto-retry** by mocking actions to return errors and verifying retry count

9. **Mock refs** for DOM properties like `scrollHeight`, `scrollTop`, `clientHeight`

10. **Use parameterized tests** (like the `isAtBottom` test) for scroll position edge cases

---

## Enzyme vs React Testing Library

Mattermost uses **Enzyme** throughout the codebase. Key characteristics:

- **Shallow rendering**: `shallow(<Component />)` only renders the component itself
- **State inspection**: Direct access via `wrapper.state()` and `wrapper.setState()`
- **Instance methods**: Direct access via `wrapper.instance().method()`
- **Prop access**: Via `wrapper.find(Child).prop('propName')`
- **Synchronous**: Works well with sync operations, needs manual async handling

For new tests, follow the existing Enzyme patterns unless migrating to RTL.

