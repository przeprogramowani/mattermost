# Saved Posts Unit Tests Implementation Plan

## Overview

This plan introduces comprehensive unit tests for the saved posts functionality after the decoupling refactoring. The implementation addresses critical testing gaps for `FlaggedPostsContainer`, `PinnedPostsContainer`, `PostListCore`, and the `useFlaggedPostsSearch` hook.

**Context**: The saved posts decoupling (Phases 1-3) is complete but has zero unit test coverage. This plan focuses on core functionality testing with priority on execution speed over coverage metrics.

## Current State Analysis

### Existing Implementation (Zero Tests)
- `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.tsx` ❌ **NO TESTS**
- `webapp/channels/src/components/pinned_posts_container/pinned_posts_container.tsx` ❌ **NO TESTS**
- `webapp/channels/src/components/search_results/post_list_core.tsx` ❌ **NO TESTS**
- `webapp/channels/src/components/flagged_posts_container/use_flagged_posts_search.tsx` ❌ **NO TESTS**

### Available Testing Infrastructure
- `renderWithContext` - Full Redux/Router/Intl context wrapper
- `TestHelper.getPostMock()` - Mock post creation with overrides
- `Constants.SEARCH_TIMEOUT_MILLISECONDS = 100` - Debounce delay
- Existing Cypress E2E tests (excellent coverage)
- No Playwright E2E tests yet (deferred)

### Key Discoveries
**Research Findings**:
- Error handling uses `mockResolvedValue({error: {...}})` pattern
- Debounce testing uses `jest.useFakeTimers()` with `advanceTimersByTime()`
- Pagination testing calls component methods directly (NOT `fireEvent.scroll`)
- TestHelper lacks specialized utilities for flagged posts state setup
- Constants.SEARCH_TIMEOUT_MILLISECONDS = 100ms

## Desired End State

### Success Criteria
After this plan is complete:
1. ✅ All four components/hooks have unit tests
2. ✅ Core user flows are tested (rendering, pagination, search, error states)
3. ✅ Tests run in under 30 seconds (speed prioritized)
4. ✅ Tests pass in CI/CD for every PR
5. ✅ Error scenarios are covered (network failures, action errors)
6. ✅ Debounced search behavior is verified with fake timers

### Verification Method
```bash
# Run tests locally
npm test -- flagged_posts_container.test.tsx
npm test -- pinned_posts_container.test.tsx
npm test -- post_list_core.test.tsx
npm test -- use_flagged_posts_search.test.ts

# Run all saved posts tests
npm test -- --testPathPattern="(flagged_posts|pinned_posts|post_list_core)"

# Verify execution time < 30s
time npm test -- --testPathPattern="(flagged_posts|pinned_posts|post_list_core)"
```

## What We're NOT Doing

- ❌ Snapshot tests (deferred to future phase)
- ❌ Deep accessibility testing (keyboard navigation, screen readers)
- ❌ Playwright E2E tests (infrastructure ready but deferred)
- ❌ Performance benchmarking with 1000+ posts
- ❌ Visual regression testing (Percy/Chromatic)
- ❌ Redux selector unit tests (unless custom selectors are added)
- ❌ Splitting test files by concern (one file per component)
- ❌ Achieving 90%+ coverage metrics (focus on core functionality)

## Implementation Approach

**Testing Strategy**: Layered approach prioritizing core functionality and speed
- **React Testing Library** patterns with `renderWithContext`
- **Fake timers** for debounce testing
- **Mock Redux actions** with `jest.fn().mockResolvedValue()`
- **Error simulation** using `mockResolvedValue({error})` and `mockRejectedValue()`
- **Direct method calls** for pagination (following existing patterns)
- **Test data** limited to <100 posts for speed

**Test Organization**: One test file per component, organized with `describe` blocks:
```
describe('ComponentName', () => {
  describe('rendering', () => { ... })
  describe('pagination', () => { ... })
  describe('error handling', () => { ... })
  describe('accessibility', () => { ... })
})
```

## Critical Implementation Details

### Timing & Lifecycle Considerations
**When applicable**: Debounced search, Redux action timing

- **Debounce Strategy**: Use `jest.useFakeTimers()` at test level, advance by `Constants.SEARCH_TIMEOUT_MILLISECONDS` (100ms)
- **React Lifecycle**: Use `waitFor()` for async state updates after Redux dispatches
- **Cleanup**: Always call `jest.useRealTimers()` in `afterEach` to prevent timer leakage
- **Timer Verification**: Check `jest.getTimerCount()` in tests to verify cleanup

**Derived from**: Research of `/Users/psmyrdek/dev/mattermost/webapp/channels/src/packages/mattermost-redux/src/utils/data_loader.test.ts` and `/Users/psmyrdek/dev/mattermost/webapp/channels/src/components/advanced_text_editor/advanced_text_editor.test.tsx`

### User Experience Specification
**When applicable**: Search clear button, pagination loading states

- **Search Clear Behavior**: Clicking X button should trigger refetch (dispatch `getFlaggedPosts('')`), show loading state during refetch
- **Loading States**: Initial load shows "Searching" text, pagination shows loading spinner at bottom
- **Empty States**: No posts shows "No saved messages" with "Save Message" call-to-action; no search results shows "No results found"
- **Pagination Loading**: Loading indicator appears at bottom when `isLoadingMore` is true

**Derived from**: User requirements and examination of components in `flagged_posts_container.tsx:111-155`

### Performance & Optimization Strategy
**When applicable**: Pagination tests with multiple posts

- **Test Data Volume**: Limit to arrays of 20-40 posts (following research recommendations)
- **Speed Target**: All tests must complete in under 30 seconds total
- **No Large Dataset Tests**: Skip 100+ post tests to maintain speed (real-world pagination tested in E2E)
- **Mock Efficiency**: Use `TestHelper.getPostMock()` with minimal overrides to reduce test setup time

**Derived from**: User requirements (speed over coverage) and research recommendations

### State Management Sequencing
**When applicable**: Redux action dispatching, loading states

- **Action Mock Pattern**: `jest.fn().mockResolvedValue({moreToLoad: boolean})` for successful actions
- **Error Pattern**: `mockResolvedValue({error: {message: string}})` for validation errors, `mockRejectedValue(new Error())` for network failures
- **Dispatch Verification**: Use `expect(mockAction).toHaveBeenCalledWith(expectedParams)`
- **Loading State Sequence**: Verify `isLoading: true → action dispatch → isLoading: false`

**Derived from**: Research of error handling patterns in `/Users/psmyrdek/dev/mattermost/webapp/channels/src/components/apps_form/apps_form_component.test.tsx`

### Debug & Observability Plan
**Required for all features**:

- **Verification Method**: Run tests with `npm test -- <test-file>`, verify all pass
- **Logging Strategy**: Suppress `console.error` for expected error tests using `console.error = jest.fn()`
- **Debug Instrumentation**: Use `screen.debug()` when tests fail to inspect rendered output
- **Timing Debug**: Use `jest.getTimerCount()` to debug timer-related issues
- **Metrics**: Test execution time measured with `time npm test -- <pattern>`

**Derived from**: Research of testing utilities and Jest debugging patterns

---

## Phase 1: FlaggedPostsContainer Tests

### Overview
Create comprehensive unit tests for the `FlaggedPostsContainer` component, covering rendering states, scroll-based pagination, server-side search with debouncing, and error handling. This is the most complex component with pagination and search functionality.

**Estimated Lines**: ~350-400 lines
**Estimated Time**: 4-5 hours

### Changes Required

#### 1. Create Test File
**File**: `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.test.tsx`

**Test Structure**:
```typescript
import {screen, waitFor} from '@testing-library/react';
import {renderWithContext} from 'tests/react_testing_utils';
import {TestHelper} from 'utils/test_helper';

import FlaggedPostsContainer from './flagged_posts_container';

// Mock Redux actions
jest.mock('mattermost-redux/actions/search', () => ({
    getMoreFlaggedPosts: jest.fn(() => ({type: 'MOCK_GET_MORE'})),
    getFlaggedPosts: jest.fn(() => ({type: 'MOCK_GET_FLAGGED'})),
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

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    describe('rendering', () => {
        test('should show loading state initially', () => {
            // Test loading state rendering
        });

        test('should show empty state when no posts', () => {
            // Test empty state with call-to-action
        });

        test('should render flagged posts', () => {
            // Test post list rendering
        });

        test('should display "Saved messages" title', () => {
            // Test header title
        });

        test('should render search input with placeholder', () => {
            // Test search input presence
        });
    });

    describe('pagination', () => {
        test('should load more posts on scroll near bottom', () => {
            // Test scroll-based pagination trigger
        });

        test('should show loading indicator during pagination', () => {
            // Test loading more state
        });

        test('should not load more when at end', () => {
            // Test isFlaggedAtEnd prevents loads
        });

        test('should not load more when already loading', () => {
            // Test prevents duplicate requests
        });
    });

    describe('search functionality', () => {
        test('should debounce search input', () => {
            // Test search debouncing with fake timers
        });

        test('should dispatch search action after debounce', () => {
            // Test getFlaggedPosts dispatch
        });

        test('should show clear button when input has value', () => {
            // Test clear button visibility
        });

        test('should clear search and refetch on clear button click', () => {
            // Test clear button behavior
        });

        test('should show "No results found" for empty search results', () => {
            // Test empty search results state
        });
    });

    describe('error handling', () => {
        test('should handle pagination action failure gracefully', () => {
            // Test error state on getMoreFlaggedPosts failure
        });

        test('should handle search action failure gracefully', () => {
            // Test error state on getFlaggedPosts failure
        });
    });

    describe('date separators', () => {
        test('should render date separators between posts', () => {
            // Test date separator rendering
        });
    });

    describe('accessibility', () => {
        test('should have proper ARIA labels', () => {
            // Test aria-label on container
        });

        test('should have heading with proper id', () => {
            // Test rhsPanelTitle
        });
    });
});
```

**Key Implementation Details**:

1. **Search Debounce Test**:
```typescript
test('should debounce search input', async () => {
    jest.useFakeTimers();
    const {getFlaggedPosts} = require('mattermost-redux/actions/search');

    const {getByTestId} = renderWithContext(<FlaggedPostsContainer/>, baseState);
    const input = getByTestId('flagged-posts-search');

    // Type multiple characters quickly
    fireEvent.input(input, {target: {value: 't'}});
    fireEvent.input(input, {target: {value: 'te'}});
    fireEvent.input(input, {target: {value: 'test'}});

    // Should not dispatch immediately
    expect(getFlaggedPosts).not.toHaveBeenCalled();

    // Advance past debounce delay
    jest.advanceTimersByTime(Constants.SEARCH_TIMEOUT_MILLISECONDS);

    // Should dispatch once with final value
    await waitFor(() => {
        expect(getFlaggedPosts).toHaveBeenCalledTimes(1);
        expect(getFlaggedPosts).toHaveBeenCalledWith('test');
    });

    jest.useRealTimers();
});
```

2. **Pagination Scroll Test**:
```typescript
test('should load more posts on scroll near bottom', async () => {
    const {getMoreFlaggedPosts} = require('mattermost-redux/actions/search');

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

    // Simulate scroll near bottom
    const scrollContainer = container.querySelector('.scrollbars__view');
    Object.defineProperty(scrollContainer, 'scrollHeight', {value: 1400, configurable: true});
    Object.defineProperty(scrollContainer, 'scrollTop', {value: 1000, configurable: true});
    Object.defineProperty(scrollContainer, 'clientHeight', {value: 400, configurable: true});

    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
        expect(getMoreFlaggedPosts).toHaveBeenCalled();
    });
});
```

3. **Error Handling Test**:
```typescript
test('should handle search action failure gracefully', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    const {getFlaggedPosts} = require('mattermost-redux/actions/search');

    // Mock action to return error
    getFlaggedPosts.mockResolvedValueOnce({
        error: {message: 'Search failed'},
    });

    renderWithContext(<FlaggedPostsContainer/>, baseState);

    // Trigger search by updating input
    jest.useFakeTimers();
    const input = screen.getByTestId('flagged-posts-search');
    fireEvent.input(input, {target: {value: 'test'}});
    jest.advanceTimersByTime(Constants.SEARCH_TIMEOUT_MILLISECONDS);

    await waitFor(() => {
        expect(getFlaggedPosts).toHaveBeenCalled();
    });

    // Component should not crash, may log error
    expect(screen.getByTestId('flagged-posts-search')).toBeInTheDocument();

    consoleError.mockRestore();
    jest.useRealTimers();
});
```

### Success Criteria

#### Automated Verification
- [x] All tests pass: `npm test -- flagged_posts_container.test.tsx`
- [x] No console errors during test execution
- [x] Test execution time < 15 seconds (actual: ~4 seconds)
- [x] All Redux action mocks are properly cleaned up (no leakage between tests)
- [x] Fake timers are properly cleaned up: `jest.getTimerCount() === 0` after each test
- [x] Type checking passes: `npm run typecheck`

#### Manual Verification
- [ ] Review test file for readability and maintainability
- [ ] Verify test names clearly describe what they test
- [ ] Confirm error handling tests cover realistic failure scenarios
- [ ] Check that debounce tests accurately reflect actual component behavior
- [ ] Ensure pagination tests match how users actually trigger loading

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the tests are well-structured and maintainable before proceeding to Phase 2.

---

## Phase 2: PinnedPostsContainer Tests

### Overview
Create unit tests for the `PinnedPostsContainer` component. This is simpler than `FlaggedPostsContainer` as it has no pagination (loads all pinned posts at once) and no search functionality. Focus on rendering states, channel-specific display, and error handling.

**Estimated Lines**: ~250-300 lines
**Estimated Time**: 3-4 hours

### Changes Required

#### 1. Create Test File
**File**: `webapp/channels/src/components/pinned_posts_container/pinned_posts_container.test.tsx`

**Test Structure**:
```typescript
import {screen} from '@testing-library/react';
import {renderWithContext} from 'tests/react_testing_utils';
import {TestHelper} from 'utils/test_helper';

import PinnedPostsContainer from './pinned_posts_container';

describe('PinnedPostsContainer', () => {
    const baseState = {
        entities: {
            channels: {
                currentChannelId: 'channel_id',
                channels: {
                    channel_id: {
                        id: 'channel_id',
                        display_name: 'Test Channel',
                        name: 'test-channel',
                        type: 'O',
                    },
                },
            },
            search: {
                pinned: {
                    channel_id: [],
                },
                isSearchingPinnedPost: false,
            },
            posts: {
                posts: {},
            },
        },
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('rendering', () => {
        test('should show loading state initially', () => {
            // Test loading state
        });

        test('should show empty state when no pinned posts', () => {
            // Test empty state with "Pin to Channel" CTA
        });

        test('should render pinned posts', () => {
            // Test post list rendering
        });

        test('should display "Pinned messages" title', () => {
            // Test header title
        });

        test('should display channel name in header', () => {
            // Test channel display name
        });

        test('should handle missing channel gracefully', () => {
            // Test when channel not found in state
        });
    });

    describe('channel-specific behavior', () => {
        test('should show posts only for current channel', () => {
            // Test channel filtering
        });

        test('should update when switching channels', () => {
            // Test channel switch updates display
        });
    });

    describe('error handling', () => {
        test('should handle missing posts gracefully', () => {
            // Test when post IDs exist but posts don't
        });
    });

    describe('accessibility', () => {
        test('should have proper ARIA labels', () => {
            // Test aria-label
        });

        test('should have heading with proper id', () => {
            // Test rhsPanelTitle
        });
    });
});
```

**Key Implementation Details**:

1. **Channel-Specific Posts Test**:
```typescript
test('should show posts only for current channel', () => {
    const channel1Posts = [
        TestHelper.getPostMock({id: 'post1', channel_id: 'channel1', is_pinned: true}),
        TestHelper.getPostMock({id: 'post2', channel_id: 'channel1', is_pinned: true}),
    ];
    const channel2Posts = [
        TestHelper.getPostMock({id: 'post3', channel_id: 'channel2', is_pinned: true}),
    ];

    const state = {
        entities: {
            channels: {
                currentChannelId: 'channel1',
                channels: {
                    channel1: TestHelper.getChannelMock({id: 'channel1', display_name: 'Channel 1'}),
                },
            },
            search: {
                pinned: {
                    channel1: ['post1', 'post2'],
                    channel2: ['post3'],
                },
                isSearchingPinnedPost: false,
            },
            posts: {
                posts: {
                    post1: channel1Posts[0],
                    post2: channel1Posts[1],
                    post3: channel2Posts[0],
                },
            },
        },
    };

    renderWithContext(<PinnedPostsContainer/>, state);

    // Should show channel1 posts
    expect(screen.getByText(channel1Posts[0].message)).toBeInTheDocument();
    expect(screen.getByText(channel1Posts[1].message)).toBeInTheDocument();

    // Should NOT show channel2 posts
    expect(screen.queryByText(channel2Posts[0].message)).not.toBeInTheDocument();
});
```

2. **Empty State Test**:
```typescript
test('should show empty state when no pinned posts', () => {
    renderWithContext(<PinnedPostsContainer/>, baseState);

    expect(screen.getByText(/no pinned messages/i)).toBeInTheDocument();
    expect(screen.getByText('Pin to Channel')).toBeInTheDocument();
});
```

3. **Missing Posts Handling**:
```typescript
test('should handle missing posts gracefully', () => {
    const state = {
        entities: {
            channels: {
                currentChannelId: 'channel_id',
                channels: {
                    channel_id: TestHelper.getChannelMock({id: 'channel_id'}),
                },
            },
            search: {
                pinned: {
                    channel_id: ['post1', 'post2', 'post3'], // IDs exist
                },
                isSearchingPinnedPost: false,
            },
            posts: {
                posts: {
                    post1: TestHelper.getPostMock({id: 'post1'}), // Only post1 exists
                    // post2 and post3 missing
                },
            },
        },
    };

    // Should not crash
    renderWithContext(<PinnedPostsContainer/>, state);

    // Should show the one post that exists
    expect(screen.getByText('post message')).toBeInTheDocument();
});
```

### Success Criteria

#### Automated Verification
- [x] All tests pass: `npm test -- pinned_posts_container.test.tsx`
- [x] No console errors during test execution
- [x] Test execution time < 10 seconds (actual: ~2.1 seconds)
- [x] Type checking passes: `npm run check-types`
- [x] All mocks properly cleaned up between tests

#### Manual Verification
- [ ] Review test coverage for channel-specific behavior
- [ ] Verify empty state tests match actual component rendering
- [ ] Confirm error handling is realistic (missing posts, missing channels)
- [ ] Check that tests clearly distinguish PinnedPosts from FlaggedPosts behavior

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: PostListCore Tests

### Overview
Create unit tests for the `PostListCore` pure rendering component. This component has zero business logic and only handles rendering based on props. Tests focus on render prop invocation, conditional rendering (loading/empty/items), and scroll event handling.

**Estimated Lines**: ~200-250 lines
**Estimated Time**: 2-3 hours

### Changes Required

#### 1. Create Test File
**File**: `webapp/channels/src/components/search_results/post_list_core.test.tsx`

**Test Structure**:
```typescript
import {render, fireEvent} from '@testing-library/react';
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

    describe('rendering states', () => {
        test('should render loading state when isLoading is true', () => {
            // Test loading state
        });

        test('should render empty state when no items', () => {
            // Test empty state
        });

        test('should render items when provided', () => {
            // Test item rendering
        });

        test('should not render loading more when showLoadMore is false', () => {
            // Test loading more hidden
        });

        test('should render loading more when showLoadMore is true', () => {
            // Test loading more visible
        });
    });

    describe('render prop invocation', () => {
        test('should call renderItem for each item', () => {
            // Test renderItem called with correct params
        });

        test('should call renderLoading when loading', () => {
            // Test renderLoading invoked
        });

        test('should call renderEmpty when empty', () => {
            // Test renderEmpty invoked
        });

        test('should call renderLoadingMore when showLoadMore is true', () => {
            // Test renderLoadingMore invoked
        });
    });

    describe('scroll handling', () => {
        test('should call onScroll when scrolled', () => {
            // Test scroll callback
        });

        test('should pass scrollbarRef to Scrollbars', () => {
            // Test ref forwarding
        });
    });

    describe('container properties', () => {
        test('should apply containerClassName', () => {
            // Test className applied
        });

        test('should set aria-label', () => {
            // Test aria-label
        });

        test('should set data-a11y attributes', () => {
            // Test accessibility attributes
        });
    });
});
```

**Key Implementation Details**:

1. **Render Item Test**:
```typescript
test('should call renderItem for each item with correct parameters', () => {
    const items = [
        {id: '1', message: 'Post 1'},
        {id: '2', message: 'Post 2'},
        {id: '3', message: 'Post 3'},
    ];

    render(<PostListCore {...baseProps} items={items}/>);

    expect(mockRenderItem).toHaveBeenCalledTimes(3);
    expect(mockRenderItem).toHaveBeenNthCalledWith(1, items[0], 0);
    expect(mockRenderItem).toHaveBeenNthCalledWith(2, items[1], 1);
    expect(mockRenderItem).toHaveBeenNthCalledWith(3, items[2], 2);
});
```

2. **Loading State Priority Test**:
```typescript
test('should render loading state even when items exist', () => {
    const items = [{id: '1', message: 'Post 1'}];

    render(<PostListCore {...baseProps} items={items} isLoading={true}/>);

    // Loading takes priority
    expect(mockRenderLoading).toHaveBeenCalled();
    expect(mockRenderItem).not.toHaveBeenCalled();
    expect(mockRenderEmpty).not.toHaveBeenCalled();
});
```

3. **Scroll Callback Test**:
```typescript
test('should call onScroll when scrolled', () => {
    const {container} = render(<PostListCore {...baseProps} items={[{id: '1', message: 'Test'}]}/>);

    const scrollContainer = container.querySelector('.scrollbars__view');
    fireEvent.scroll(scrollContainer);

    expect(mockOnScroll).toHaveBeenCalled();
});
```

4. **Loading More Conditional Rendering**:
```typescript
test('should render loading more when showLoadMore is true', () => {
    const items = [{id: '1', message: 'Post 1'}];

    render(<PostListCore {...baseProps} items={items} showLoadMore={true}/>);

    expect(mockRenderLoadingMore).toHaveBeenCalled();
});

test('should not render loading more when showLoadMore is false', () => {
    const items = [{id: '1', message: 'Post 1'}];

    render(<PostListCore {...baseProps} items={items} showLoadMore={false}/>);

    expect(mockRenderLoadingMore).not.toHaveBeenCalled();
});
```

### Success Criteria

#### Automated Verification
- [ ] All tests pass: `npm test -- post_list_core.test.tsx`
- [ ] No console errors during test execution
- [ ] Test execution time < 5 seconds
- [ ] Type checking passes: `npm run typecheck`
- [ ] All render prop mocks properly verified

#### Manual Verification
- [ ] Review tests for completeness (all props tested)
- [ ] Verify render priority logic is tested (loading > empty > items)
- [ ] Confirm tests are focused on pure rendering logic only
- [ ] Check that tests don't test business logic (that's in containers)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: useFlaggedPostsSearch Hook Tests

### Overview
Create unit tests for the `useFlaggedPostsSearch` custom hook. This hook manages debounced search state and dispatches server-side search actions. Tests focus on state management, debounce behavior with fake timers, action dispatching, and clear functionality.

**Estimated Lines**: ~150-200 lines
**Estimated Time**: 2-3 hours

### Changes Required

#### 1. Create Test File
**File**: `webapp/channels/src/components/flagged_posts_container/use_flagged_posts_search.test.ts`

**Test Structure**:
```typescript
import {renderHook, act, waitFor} from '@testing-library/react';
import {Provider} from 'react-redux';
import {IntlProvider} from 'react-intl';
import {createStore} from 'redux';

import {useFlaggedPostsSearch} from './use_flagged_posts_search';

// Mock Redux actions
jest.mock('mattermost-redux/actions/search', () => ({
    getFlaggedPosts: jest.fn(() => ({type: 'MOCK_GET_FLAGGED'})),
}));

describe('useFlaggedPostsSearch', () => {
    const mockStore = createStore(() => ({}));

    const wrapper = ({children}: {children: React.ReactNode}) => (
        <Provider store={mockStore}>
            <IntlProvider locale="en">
                {children}
            </IntlProvider>
        </Provider>
    );

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('state management', () => {
        test('should initialize with empty query', () => {
            // Test initial state
        });

        test('should update inputValue immediately on change', () => {
            // Test input state update
        });

        test('should update searchTerm after debounce', () => {
            // Test debounced searchTerm update
        });
    });

    describe('debouncing', () => {
        test('should debounce search dispatch by SEARCH_TIMEOUT_MILLISECONDS', () => {
            // Test debounce timing
        });

        test('should cancel previous timer on new input', () => {
            // Test debounce cancellation
        });

        test('should not dispatch on initial mount with empty input', () => {
            // Test skips initial empty dispatch
        });
    });

    describe('action dispatching', () => {
        test('should dispatch getFlaggedPosts with search term after debounce', () => {
            // Test action dispatch
        });

        test('should dispatch with empty string when cleared', () => {
            // Test clear dispatch
        });
    });

    describe('clear functionality', () => {
        test('should show clear button when input has value', () => {
            // Test searchInputSuffix presence
        });

        test('should hide clear button when input is empty', () => {
            // Test searchInputSuffix absence
        });

        test('should clear input and dispatch empty search on clear', () => {
            // Test handleClearSearch
        });
    });
});
```

**Key Implementation Details**:

1. **Debounce Timing Test**:
```typescript
test('should debounce search dispatch by SEARCH_TIMEOUT_MILLISECONDS', async () => {
    jest.useFakeTimers();
    const {getFlaggedPosts} = require('mattermost-redux/actions/search');
    const dispatchSpy = jest.spyOn(mockStore, 'dispatch');

    const {result} = renderHook(() => useFlaggedPostsSearch(), {wrapper});

    act(() => {
        result.current.handleInputChange('test query');
    });

    // Should not dispatch immediately
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(result.current.inputValue).toBe('test query');
    expect(result.current.searchTerm).toBe('');

    // Advance halfway through timeout
    act(() => {
        jest.advanceTimersByTime(Constants.SEARCH_TIMEOUT_MILLISECONDS / 2);
    });

    expect(dispatchSpy).not.toHaveBeenCalled();

    // Advance past timeout
    act(() => {
        jest.advanceTimersByTime(Constants.SEARCH_TIMEOUT_MILLISECONDS / 2);
    });

    // Wait for state update
    await waitFor(() => {
        expect(result.current.searchTerm).toBe('test query');
    });

    expect(dispatchSpy).toHaveBeenCalledWith(getFlaggedPosts('test query'));
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
});
```

2. **Debounce Cancellation Test**:
```typescript
test('should cancel previous timer on new input', async () => {
    jest.useFakeTimers();
    const {getFlaggedPosts} = require('mattermost-redux/actions/search');
    const dispatchSpy = jest.spyOn(mockStore, 'dispatch');

    const {result} = renderHook(() => useFlaggedPostsSearch(), {wrapper});

    // First input
    act(() => {
        result.current.handleInputChange('test');
    });

    // Advance halfway
    act(() => {
        jest.advanceTimersByTime(Constants.SEARCH_TIMEOUT_MILLISECONDS / 2);
    });

    // Second input (cancels first timer)
    act(() => {
        result.current.handleInputChange('test query');
    });

    // Advance past original timeout
    act(() => {
        jest.advanceTimersByTime(Constants.SEARCH_TIMEOUT_MILLISECONDS);
    });

    await waitFor(() => {
        expect(result.current.searchTerm).toBe('test query');
    });

    // Should only dispatch once with final value
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith(getFlaggedPosts('test query'));

    jest.useRealTimers();
});
```

3. **Clear Button Test**:
```typescript
test('should show clear button when input has value', () => {
    const {result} = renderHook(() => useFlaggedPostsSearch(), {wrapper});

    act(() => {
        result.current.handleInputChange('test');
    });

    expect(result.current.searchInputSuffix).toBeDefined();
    expect(result.current.searchInputSuffix?.type).toBe('button');
});

test('should hide clear button when input is empty', () => {
    const {result} = renderHook(() => useFlaggedPostsSearch(), {wrapper});

    expect(result.current.searchInputSuffix).toBeUndefined();
});
```

4. **Skip Initial Empty Dispatch Test**:
```typescript
test('should not dispatch on initial mount with empty input', async () => {
    jest.useFakeTimers();
    const dispatchSpy = jest.spyOn(mockStore, 'dispatch');

    renderHook(() => useFlaggedPostsSearch(), {wrapper});

    // Advance past timeout
    act(() => {
        jest.advanceTimersByTime(Constants.SEARCH_TIMEOUT_MILLISECONDS);
    });

    // Should not dispatch because input is empty and no search has occurred yet
    expect(dispatchSpy).not.toHaveBeenCalled();

    jest.useRealTimers();
});
```

5. **Clear and Refetch Test**:
```typescript
test('should clear input and dispatch empty search on clear', async () => {
    jest.useFakeTimers();
    const {getFlaggedPosts} = require('mattermost-redux/actions/search');
    const dispatchSpy = jest.spyOn(mockStore, 'dispatch');

    const {result} = renderHook(() => useFlaggedPostsSearch(), {wrapper});

    // Type search query
    act(() => {
        result.current.handleInputChange('test query');
    });

    act(() => {
        jest.advanceTimersByTime(Constants.SEARCH_TIMEOUT_MILLISECONDS);
    });

    await waitFor(() => {
        expect(result.current.searchTerm).toBe('test query');
    });

    dispatchSpy.mockClear();

    // Clear search
    act(() => {
        result.current.handleClearSearch();
    });

    expect(result.current.inputValue).toBe('');
    expect(result.current.searchTerm).toBe('');
    expect(dispatchSpy).toHaveBeenCalledWith(getFlaggedPosts(''));

    jest.useRealTimers();
});
```

### Success Criteria

#### Automated Verification
- [ ] All tests pass: `npm test -- use_flagged_posts_search.test.ts`
- [ ] No console errors during test execution
- [ ] Test execution time < 5 seconds
- [ ] Type checking passes: `npm run typecheck`
- [ ] All timers properly cleaned up: `jest.getTimerCount() === 0`
- [ ] Redux dispatch spy properly verified

#### Manual Verification
- [ ] Review debounce tests match actual hook behavior
- [ ] Verify timer advancement values are correct (SEARCH_TIMEOUT_MILLISECONDS)
- [ ] Confirm clear button tests match component integration
- [ ] Check that tests don't dispatch on initial empty mount (matches production behavior)

**Implementation Note**: After completing this phase and all automated verification passes, the unit test implementation is complete. Run all tests together to verify total execution time is under 30 seconds.

---

## Testing Strategy

### Unit Tests Overview
- **Target**: Core rendering, state management, user interactions
- **Framework**: Jest + React Testing Library
- **Patterns**: `renderWithContext`, `renderHook`, fake timers
- **Mock Strategy**: Redux actions mocked at module level
- **Focus**: Speed and maintainability over coverage metrics

### Test Data Management
**Use TestHelper consistently**:
```typescript
// Good: Use TestHelper
const post = TestHelper.getPostMock({id: 'post1', message: 'Test'});

// Bad: Manual object creation (missing required fields)
const post = {id: 'post1', message: 'Test'}; // ❌ Incomplete
```

**Create multiple posts efficiently**:
```typescript
const posts = Array.from({length: 20}, (_, i) =>
    TestHelper.getPostMock({
        id: `post${i}`,
        message: `Post ${i}`,
        create_at: Date.now() - (i * 3600000), // 1 hour apart
    })
);
```

### Async Testing
**Handle async operations properly**:
```typescript
// Good: Use waitFor
await waitFor(() => {
    expect(screen.getByText('Loaded')).toBeInTheDocument();
});

// Bad: No wait (flaky test)
expect(screen.getByText('Loaded')).toBeInTheDocument(); // ❌ May fail
```

### Mock Management
**Best Practices**:
- Mock at module level, not function level
- Clear mocks between tests (`jest.clearAllMocks()`)
- Use `jest.spyOn` for partial mocks
- Mock external dependencies, not internal logic

**Example**:
```typescript
// Good: Mock at module level
jest.mock('mattermost-redux/actions/search', () => ({
    getFlaggedPosts: jest.fn(() => ({type: 'MOCK'})),
}));

beforeEach(() => {
    jest.clearAllMocks();
});
```

---

## Performance Considerations

### Test Execution Speed
- **Target**: All tests complete in under 30 seconds
- **Strategy**: Limit test data to <100 posts, use minimal mocks
- **Measurement**: `time npm test -- --testPathPattern="(flagged_posts|pinned_posts|post_list_core)"`

### Optimization Techniques
1. **Minimal State**: Only include necessary Redux state slices
2. **Shallow Mocks**: Mock only what's needed for the test
3. **Avoid Large Arrays**: Keep test data arrays under 40 items
4. **Parallel Tests**: Jest runs tests in parallel by default
5. **Fast Timers**: Use `jest.advanceTimersByTime()` instead of `jest.runAllTimers()`

---

## Migration Notes

N/A - This is net-new test implementation with no migration required.

---

## References

### Original Research
- `thoughts/shared/research/2025-11-12-saved-posts-testing-strategy.md` - Testing strategy document

### Components to Test
- `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.tsx:1` - Main container
- `webapp/channels/src/components/pinned_posts_container/pinned_posts_container.tsx:1` - Pinned container
- `webapp/channels/src/components/search_results/post_list_core.tsx:1` - Core list component
- `webapp/channels/src/components/flagged_posts_container/use_flagged_posts_search.tsx:1` - Search hook

### Testing Utilities
- `webapp/channels/src/tests/react_testing_utils.tsx:48` - `renderWithContext`
- `webapp/channels/src/tests/react_testing_utils.tsx:162` - `renderHookWithContext`
- `webapp/channels/src/utils/test_helper.ts:322` - `TestHelper.getPostMock()`
- `webapp/channels/src/utils/constants.tsx:2099` - `Constants.SEARCH_TIMEOUT_MILLISECONDS`

### Reference Test Patterns
- Error Handling: `webapp/channels/src/components/apps_form/apps_form_component.test.tsx:130`
- Debounce Testing: `webapp/channels/src/packages/mattermost-redux/src/utils/data_loader.test.ts:177`
- Pagination Testing: `webapp/channels/src/components/post_view/post_list/post_list.test.tsx:89`

### Redux Actions
- `mattermost-redux/actions/search` - `getFlaggedPosts()`, `getMoreFlaggedPosts()`

---

## Open Questions

None - all questions were resolved during planning phase.

---

## Metrics & Success Criteria

### Test Coverage Targets
- **Core Functionality**: All user-facing flows tested (rendering, pagination, search, errors)
- **Speed**: < 30 seconds total execution time
- **Reliability**: < 5% flaky test rate

### Quality Gates
- All tests pass locally before PR
- No console errors/warnings during tests
- All mocks and timers properly cleaned up
- Test names clearly describe what they test

### Maintenance
- Update tests when component logic changes
- Keep test data minimal for speed
- Document non-obvious test patterns with comments
- Review test clarity in code reviews

---

## Conclusion

This plan introduces comprehensive unit tests for the saved posts functionality, prioritizing core user flows and execution speed over coverage metrics. The layered testing strategy provides:

1. **Fast feedback** via focused unit tests (< 30 sec)
2. **Confidence** in core functionality (rendering, pagination, search)
3. **Error resilience** via error state testing
4. **Maintainability** via clear test organization and consistent patterns

**Estimated Total Effort**: 11-15 hours across 4 phases

**Key Success Factor**: Use existing testing infrastructure (`renderWithContext`, `TestHelper`, fake timers) to maintain consistency with the codebase's established testing patterns and achieve the speed target.
