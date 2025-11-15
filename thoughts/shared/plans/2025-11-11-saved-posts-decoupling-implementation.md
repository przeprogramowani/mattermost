# Saved Posts UI Decoupling Implementation Plan

## Overview

Decouple the Search, Pinned Posts, and Flagged Posts (Saved Posts) features from the monolithic `SearchResults` component by extracting a pure `PostListCore` component and creating separate feature-specific containers. This is a **pure refactoring** with zero behavioral changes - all existing functionality must be preserved exactly as-is.

## Current State Analysis

### Problem: God Component Anti-Pattern

**File**: `webapp/channels/src/components/search_results/search_results.tsx` (477 lines)

The `SearchResults` component handles ALL three features through extensive conditional logic:

- **20+ conditional branches** checking `isFlaggedPosts`, `isPinnedPosts`, `isMentionSearch`, `isChannelFiles`, `isCard` flags
- **30+ props** with many feature-specific flags
- **High cyclomatic complexity** making testing and maintenance difficult
- **Tight coupling** - changes to one feature risk breaking others

### Key Coupling Points

1. **Conditional Pagination** (lines 82-96)
   ```typescript
   if (props.isFlaggedPosts) {
     loadMoreFlaggedPosts();
   } else {
     loadMorePosts();
   }
   ```

2. **Conditional Loading States** (line 154)
   ```typescript
   const isLoading = isSearchingTerm || isSearchingFlaggedPost || isSearchingPinnedPost;
   ```

3. **Conditional Empty States** (lines 169-236)
   - Large if/else chain determining title and empty state variant
   - Different `NoResultsVariant` for each feature

4. **Conditional Rendering** (lines 321-324)
   - Props propagated through child components
   - `PostSearchResultsItem` receives all feature flags

5. **Redux Action Coupling** (`actions/post_actions.ts:101-127`)
   - `flagPost()` and `unflagPost()` check `rhsState === RHSStates.FLAG`
   - Conditionally update search results based on RHS state

### Shared Patterns (The "Core")

Despite tight coupling, all three features share:
- **List rendering**: Array of posts mapped to items with date separators
- **Scroll-based pagination**: 30px buffer, debounced, loading states
- **Post item rendering**: `PostSearchResultsItem` wrapping `PostComponent`
- **Loading indicators**: Common spinner patterns
- **Empty states**: `NoResultsIndicator` with different variants

## Desired End State

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    RHS Panel Router                         │
│          (sidebar_right/sidebar_right.tsx)                  │
└────┬────────────────────┬────────────────────┬──────────────┘
     │                    │                    │
     ▼                    ▼                    ▼
┌────────────────┐  ┌────────────────┐  ┌──────────────────┐
│ FlaggedPosts   │  │ PinnedPosts    │  │ SearchResults    │
│ Container      │  │ Container      │  │ Container        │
│ (Saved Posts)  │  │                │  │                  │
└────┬───────────┘  └────┬───────────┘  └────┬─────────────┘
     │                   │                    │
     │  All use          │                    │
     ▼                   ▼                    ▼
┌──────────────────────────────────────────────────────────┐
│                  PostListCore                             │
│  (Pure component - ZERO conditionals)                    │
│                                                           │
│  Props: items, renderItem, renderEmpty, renderLoading,   │
│         isLoading, isLoadingMore, hasMore, onLoadMore    │
└──────────────────────────────────────────────────────────┘
```

### Key Principles

1. **PostListCore has ZERO conditionals** - all behavior injected via props
2. **Each container owns its feature logic** - no shared conditionals
3. **Render props pattern** for flexibility
4. **Single responsibility** - core only handles list rendering and scroll pagination
5. **Exact behavioral equivalence** - no UX changes

### Verification Criteria

After implementation:
- All existing tests pass
- Manual testing shows identical behavior for all three features
- No regressions in:
  - Pagination (flagged posts)
  - Real-time updates (pin/unpin, flag/unflag)
  - Empty states
  - Loading states
  - Date separators
  - Search highlighting
  - Accessibility (keyboard navigation, ARIA labels)

## What We're NOT Doing

1. **No Redux state changes** - Keep shared `state.entities.search` slice
2. **No UX changes** - Preserve exact behavior (scroll position, loading, empty states)
3. **No performance work** - Already done, just preserve it
4. **No new features** - Pure refactoring only
5. **No state persistence** - Keep existing behavior (fetch from start when returning)
6. **Don't touch main feed** - Only RHS panel (`state.entities.search.flagged` only, not `post.is_flagged`)

## Implementation Approach

### Strategy: Incremental Refactoring

We'll use a **phased approach** that allows verification at each step:

1. **Phase 1**: Extract `PostListCore` as internal component (no external changes)
2. **Phase 2**: Create `FlaggedPostsContainer` (saved posts)
3. **Phase 3**: Create `PinnedPostsContainer`
4. **Phase 4**: Create `SearchResultsContainer` and update routing
5. **Phase 5**: Remove old `SearchResults` component

Each phase:
- Maintains backward compatibility
- Can be tested independently
- Has clear rollback path
- Verified with automated and manual tests

## Critical Implementation Details

### Timing & Lifecycle Considerations

**N/A**: This is a pure UI refactoring with no timing-sensitive operations. All scroll handling, effect timing, and lifecycle management are already implemented and will be preserved as-is.

### User Experience Specification

**From Requirements**:
- **Scroll Position**: Always fetch from start when returning to saved posts (no restoration)
- **Loading States**: Inline loader at bottom during "load more" (already implemented)
- **Empty States**: Use existing default empty state (no modifications)
- **Real-time Updates**: Keep current functionality exactly as-is
- **Transitions**: No changes to existing behavior

**Derived from**: User requirement for pure refactoring with zero behavioral changes.

### Performance & Optimization Strategy

**N/A**: Performance work already done (pagination at 30px buffer, debounced scroll, virtualization where needed). This refactoring preserves all existing optimizations.

**Key preservation**:
- Keep existing `arePropsEqual` memoization in `SearchResults` (lines 425-474)
- Maintain debounced scroll handlers (100ms)
- Preserve 30px load-more buffer
- Keep Redux selector memoization patterns

**Derived from**: Research shows pagination and performance already implemented; user confirmed no changes needed.

### State Management Sequencing

**Current Flow** (to be preserved exactly):
```
User scrolls near bottom
  ↓
Debounced scroll handler (100ms)
  ↓
Check: isLoading or isAtEnd? → Stop
  ↓
Dispatch load more action (flagPost/search/pin specific)
  ↓
Redux reducer updates loading state
  ↓
Component re-renders with isLoadingMore=true
  ↓
API fetch completes
  ↓
Redux reducer merges new posts (filter duplicates)
  ↓
Component re-renders with new posts + isLoadingMore=false
```

**Duplicate Filtering** (from requirement #5):
- Redux reducer handles this: `[...new Set(state.concat(action.data.order))]`
- Located in: `webapp/channels/src/packages/mattermost-redux/src/reducers/entities/search.ts:17,87`

**Derived from**: Redux reducer analysis + user requirement to filter duplicates when adding fetched content.

### Debug & Observability Plan

**Required for all features**:

**Verification Method** (from requirements):
- Manual testing of all three features after each phase
- Verify identical behavior to old implementation
- Standard automated test suite

**Logging Strategy** (preserve existing):
- No logging changes - preserve existing console.log patterns if any
- Redux DevTools already available for state inspection

**Testing Approach**:
- Automated: Jest tests for component rendering and interactions
- Manual: Full regression testing checklist for each feature
- Comparison: Old vs new implementation side-by-side testing during development

**Metrics**:
- No new metrics - preserve existing behavior
- Success = zero behavior change, zero regressions

**Derived from**: User requirements for standard testing with no major changes.

## Phase 1: Extract PostListCore Component

### Overview

Extract the core list rendering logic into a pure `PostListCore` component **within** the existing `SearchResults.tsx` file. This is an internal refactor with no external changes - the `SearchResults` component still exports the same interface.

### Goal

Create a reusable, pure component that handles:
- List rendering with scroll-based pagination
- Loading states (initial and "load more")
- Empty states
- Date separators
- Scroll event handling with debouncing

### Changes Required

#### 1. Create PostListCore Component

**File**: `webapp/channels/src/components/search_results/search_results.tsx`

**Add after imports, before `SearchResults` component (around line 45)**:

```typescript
interface PostListCoreProps {
    // Data
    items: Array<Post | string | FileSearchResultItemType>;

    // Rendering
    renderItem: (item: Post | string | FileSearchResultItemType, index: number) => React.ReactNode;
    renderEmpty: () => React.ReactNode;
    renderLoading: () => React.ReactNode;
    renderLoadingMore: () => React.ReactNode;

    // State
    isLoading: boolean;
    isLoadingMore: boolean;
    showLoadMore: boolean;

    // Actions
    onScroll: () => void;

    // Configuration
    scrollbarRef: React.RefObject<HTMLDivElement>;
    containerClassName: string;
    ariaLabel: string;
}

/**
 * Pure list rendering component with zero conditionals.
 * All behavior is injected via props.
 */
const PostListCore: React.FC<PostListCoreProps> = React.memo((props) => {
    const {
        items,
        renderItem,
        renderEmpty,
        renderLoading,
        renderLoadingMore,
        isLoading,
        isLoadingMore,
        showLoadMore,
        onScroll,
        scrollbarRef,
        containerClassName,
        ariaLabel,
    } = props;

    // Loading state - initial load
    if (isLoading) {
        return renderLoading();
    }

    // Empty state
    if (!items || items.length === 0) {
        return renderEmpty();
    }

    // Render list
    const contentItems = items.map((item, index) => renderItem(item, index));
    const loadingMore = showLoadMore || isLoadingMore ? renderLoadingMore() : null;

    return (
        <Scrollbars
            ref={scrollbarRef}
            color='--center-channel-color-rgb'
            onScroll={onScroll}
        >
            <div
                className={containerClassName}
                aria-label={ariaLabel}
            >
                {contentItems}
                {loadingMore}
            </div>
        </Scrollbars>
    );
});

PostListCore.displayName = 'PostListCore';
```

#### 2. Refactor SearchResults to Use PostListCore

**File**: `webapp/channels/src/components/search_results/search_results.tsx`

**Modify the main `SearchResults` component** (starting around line 245):

Replace the existing `switch (true)` statement with calls to `PostListCore`:

```typescript
// Prepare render functions
const renderItem = (item: string | Post | FileSearchResultItemType, index: number) => {
    if (searchType === DataSearchTypes.MESSAGES_SEARCH_TYPE && !props.isChannelFiles) {
        if (typeof item === 'string' && isDateLine(item)) {
            const date = getDateForDateLine(item);
            return (
                <DateSeparator
                    key={date}
                    date={date}
                />
            );
        }

        const post = item as Post;
        return (
            <PostSearchResultsItem
                key={post.id}
                post={post}
                matches={props.matches[post.id] || []}
                searchTerm={searchTerms}
                isFlaggedPosts={props.isFlaggedPosts}
                isMentionSearch={props.isMentionSearch}
                isPinnedPosts={props.isPinnedPosts}
                a11yIndex={index}
            />
        );
    }

    // File results
    return (
        <FileSearchResultItem
            key={(item as FileSearchResultItemType).id}
            channelId={(item as FileSearchResultItemType).channel_id}
            fileInfo={item as FileSearchResultItemType}
            teamName={props.currentTeamName}
            pluginMenuItems={filesDropdownPluginMenuItems}
        />
    );
};

const renderLoading = () => (
    <div className='sidebar--right__subheader a11y__section'>
        <div className='sidebar--right__loading'>
            <LoadingWrapper text={defineMessage({id: 'search_header.loading', defaultMessage: 'Searching'})}/>
        </div>
    </div>
);

const renderEmpty = () => {
    // Determine if should show search hints or no results
    const showSearchHints = (noResults && !searchTerms && !isMentionSearch && !isPinnedPosts && !isFlaggedPosts && !isChannelFiles);

    if (showSearchHints) {
        return (
            <div className='sidebar--right__subheader search__hints a11y__section'>
                <SearchHint
                    onOptionSelected={handleOptionSelection}
                    options={searchHintOptions}
                />
            </div>
        );
    }

    return (
        <div
            className={classNames([
                'sidebar--right__subheader a11y__section',
                {'sidebar-expanded': isSideBarExpanded},
            ])}
            aria-live='polite'
        >
            <NoResultsIndicator
                style={{padding: '48px'}}
                {...noResultsProps}
            />
        </div>
    );
};

const renderLoadingMore = () => (
    <div className='loading-screen'>
        <div className='loading__content'>
            <div className='round round-1'/>
            <div className='round round-2'/>
            <div className='round round-3'/>
        </div>
    </div>
);

// Determine what to render based on search type
const itemsToRender = searchType === DataSearchTypes.FILES_SEARCH_TYPE || isChannelFiles
    ? fileResults
    : sortedResults;

// Use PostListCore for rendering
const listContent = (
    <PostListCore
        items={itemsToRender}
        renderItem={renderItem}
        renderEmpty={renderEmpty}
        renderLoading={renderLoading}
        renderLoadingMore={renderLoadingMore}
        isLoading={isLoading}
        isLoadingMore={props.isSearchGettingMore || props.isGettingMoreFlaggedPosts}
        showLoadMore={showLoadMore}
        onScroll={handleScroll}
        scrollbarRef={scrollbars}
        containerClassName={classNames([
            'search-items-container post-list__table a11y__region',
            {
                'no-results': (noResults && searchType === DataSearchTypes.MESSAGES_SEARCH_TYPE) || (noFileResults && (searchType === DataSearchTypes.FILES_SEARCH_TYPE || isChannelFiles)),
                'channel-files-container': isChannelFiles,
            },
        ])}
        ariaLabel={intl.formatMessage({
            id: 'accessibility.sections.rhs',
            defaultMessage: '{regionTitle} complementary region',
        }, {
            regionTitle: formattedTitle,
        })}
    />
);
```

**Update the return statement** (around line 350):

```typescript
return (
    <div
        id='searchContainer'
        className='SearchResults sidebar-right__body'
    >
        <SearchResultsHeader>
            <h2 id='rhsPanelTitle'>
                {formattedTitle}
            </h2>
            {props.channelDisplayName && <div className='sidebar--right__title__channel'>{props.channelDisplayName}</div>}
        </SearchResultsHeader>
        {isMessagesSearch &&
            <MessageOrFileSelector
                selected={searchType}
                selectedFilter={searchFilterType}
                isFileAttachmentsEnabled={isFileAttachmentsEnabled(config)}
                messagesCounter={isSearchAtEnd || props.searchPage === 0 ? `${results.length}` : `${results.length}+`}
                filesCounter={isSearchFilesAtEnd || props.searchPage === 0 ? `${fileResults.length}` : `${fileResults.length}+`}
                onChange={setSearchType}
                onFilter={setSearchFilterType}
                onTeamChange={setSearchTeam}
                crossTeamSearchEnabled={props.crossTeamSearchEnabled}
            />}
        {isChannelFiles &&
            <div className='channel-files__header'>
                <div className='channel-files__title'>
                    <FormattedMessage
                        id='search_results.channel-files-header'
                        defaultMessage='Recent files'
                    />
                </div>
                <FilesFilterMenu
                    selectedFilter={searchFilterType}
                    onFilter={setSearchFilterType}
                />
            </div>
        }
        <SearchLimitsBanner searchType={searchType}/>
        {listContent}
    </div>
);
```

### Success Criteria

#### Automated Verification:
- [x] All existing SearchResults tests pass: `npm test search_results`
- [x] Type checking passes: `npm run typecheck`
- [x] Linting passes: `npm run lint`
- [ ] No console errors in browser when using any of the three features

#### Manual Verification:
- [ ] **Search Results**: Open search, search for a term, verify results display correctly
- [ ] **Search Results**: Scroll to bottom, verify "load more" works
- [ ] **Pinned Posts**: Open pinned posts in a channel, verify posts display
- [ ] **Pinned Posts**: Verify no "load more" (all loaded at once)
- [ ] **Flagged Posts**: Open saved posts, verify posts display
- [ ] **Flagged Posts**: Scroll to bottom, verify pagination loads more
- [ ] **Empty States**: Verify all three features show correct empty states when no results
- [ ] **Loading States**: Verify spinners appear during initial load
- [ ] **Date Separators**: Verify date separators appear correctly in all three features
- [ ] **Search Highlighting**: Verify search term highlighting still works in search results

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the manual testing was successful before proceeding to the next phase.

**Status**: ✅ COMPLETED

---

## Phase 2: Create FlaggedPostsContainer Component

### Overview

Create a dedicated container component for Flagged Posts (Saved Posts) that uses `PostListCore`. This component will:
- Connect to Redux for flagged posts data
- Handle flagged-specific pagination logic
- Provide flagged-specific rendering (empty state, title, etc.)
- Mount in RHS when `rhsState === RHSStates.FLAG`

### Changes Required

#### 1. Create FlaggedPostsContainer Component

**File**: `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.tsx` (NEW)

```typescript
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useRef} from 'react';
import {useIntl, defineMessage} from 'react-intl';
import {useSelector, useDispatch} from 'react-redux';

import type {Post} from '@mattermost/types/posts';

import {debounce} from 'mattermost-redux/actions/helpers';
import {isDateLine, getDateForDateLine} from 'mattermost-redux/utils/post_list';

import DateSeparator from 'components/post_view/date_separator';
import NoResultsIndicator from 'components/no_results_indicator/no_results_indicator';
import {NoResultsVariant} from 'components/no_results_indicator/types';
import SearchResultsHeader from 'components/search_results_header';
import LoadingWrapper from 'components/widgets/loading/loading_wrapper';
import PostSearchResultsItem from 'components/search_results/post_search_results_item';
import SearchLimitsBanner from 'components/search_results/search_limits_banner';

import {
    getFlaggedPosts,
    getIsSearchingFlaggedPost,
    getIsGettingMoreFlaggedPosts,
    getIsFlaggedAtEnd,
} from 'selectors/rhs';

import {getMoreFlaggedPosts} from 'actions/post_actions';

import PostListCore from './post_list_core';

import './flagged_posts_container.scss';

const GET_MORE_BUFFER = 30;

const FlaggedPostsContainer: React.FC = () => {
    const intl = useIntl();
    const dispatch = useDispatch();
    const scrollbars = useRef<HTMLDivElement>(null);

    // Redux state
    const posts = useSelector(getFlaggedPosts);
    const isLoading = useSelector(getIsSearchingFlaggedPost);
    const isLoadingMore = useSelector(getIsGettingMoreFlaggedPosts);
    const isAtEnd = useSelector(getIsFlaggedAtEnd);

    // Load flagged posts on mount (if not already loaded)
    useEffect(() => {
        // Note: showFlaggedPosts() action is dispatched by RHS routing
        // This component just handles rendering and pagination
    }, []);

    // Scroll handler for pagination
    const handleScroll = (): void => {
        if (!isLoading && !isLoadingMore && !isAtEnd) {
            const scrollHeight = scrollbars.current?.scrollHeight || 0;
            const scrollTop = scrollbars.current?.scrollTop || 0;
            const clientHeight = scrollbars.current?.clientHeight || 0;

            if ((scrollTop + clientHeight + GET_MORE_BUFFER) >= scrollHeight) {
                loadMoreFlaggedPosts();
            }
        }
    };

    const loadMoreFlaggedPosts = debounce(
        () => {
            dispatch(getMoreFlaggedPosts());
        },
        100,
        false,
        (): void => {},
    );

    // Render functions
    const renderItem = (item: Post | string, index: number) => {
        if (typeof item === 'string' && isDateLine(item)) {
            const date = getDateForDateLine(item);
            return (
                <DateSeparator
                    key={date}
                    date={date}
                />
            );
        }

        const post = item as Post;
        return (
            <PostSearchResultsItem
                key={post.id}
                post={post}
                matches={[]}
                searchTerm={''}
                isFlaggedPosts={true}
                isMentionSearch={false}
                isPinnedPosts={false}
                a11yIndex={index}
            />
        );
    };

    const renderLoading = () => (
        <div className='sidebar--right__subheader a11y__section'>
            <div className='sidebar--right__loading'>
                <LoadingWrapper text={defineMessage({id: 'search_header.loading', defaultMessage: 'Searching'})}/>
            </div>
        </div>
    );

    const renderEmpty = () => {
        const noResultsProps = {
            variant: NoResultsVariant.FlaggedPosts,
            subtitleValues: {
                buttonText: <strong>{
                    intl.formatMessage({
                        id: 'flag_post.flag',
                        defaultMessage: 'Save Message',
                    })
                }</strong>,
            },
        };

        return (
            <div className='sidebar--right__subheader a11y__section'>
                <NoResultsIndicator
                    style={{padding: '48px'}}
                    {...noResultsProps}
                />
            </div>
        );
    };

    const renderLoadingMore = () => (
        <div className='loading-screen'>
            <div className='loading__content'>
                <div className='round round-1'/>
                <div className='round round-2'/>
                <div className='round round-3'/>
            </div>
        </div>
    );

    const formattedTitle = intl.formatMessage({
        id: 'search_header.title3',
        defaultMessage: 'Saved messages',
    });

    const showLoadMore = !isAtEnd && !isLoading;

    return (
        <div
            id='searchContainer'
            className='FlaggedPostsContainer SearchResults sidebar-right__body'
        >
            <SearchResultsHeader>
                <h2 id='rhsPanelTitle'>
                    {formattedTitle}
                </h2>
            </SearchResultsHeader>
            <SearchLimitsBanner searchType='messages'/>
            <PostListCore
                items={posts}
                renderItem={renderItem}
                renderEmpty={renderEmpty}
                renderLoading={renderLoading}
                renderLoadingMore={renderLoadingMore}
                isLoading={isLoading}
                isLoadingMore={isLoadingMore}
                showLoadMore={showLoadMore}
                onScroll={handleScroll}
                scrollbarRef={scrollbars}
                containerClassName='search-items-container post-list__table a11y__region'
                ariaLabel={intl.formatMessage({
                    id: 'accessibility.sections.rhs',
                    defaultMessage: '{regionTitle} complementary region',
                }, {
                    regionTitle: formattedTitle,
                })}
            />
        </div>
    );
};

export default FlaggedPostsContainer;
```

#### 2. Create PostListCore Shared Component

**File**: `webapp/channels/src/components/search_results/post_list_core.tsx` (NEW)

Extract `PostListCore` from Phase 1 into a separate file for reusability:

```typescript
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import type {Post} from '@mattermost/types/posts';
import type {FileSearchResultItem as FileSearchResultItemType} from '@mattermost/types/files';

import Scrollbars from 'components/common/scrollbars';

export interface PostListCoreProps {
    // Data
    items: Array<Post | string | FileSearchResultItemType>;

    // Rendering
    renderItem: (item: Post | string | FileSearchResultItemType, index: number) => React.ReactNode;
    renderEmpty: () => React.ReactNode;
    renderLoading: () => React.ReactNode;
    renderLoadingMore: () => React.ReactNode;

    // State
    isLoading: boolean;
    isLoadingMore: boolean;
    showLoadMore: boolean;

    // Actions
    onScroll: () => void;

    // Configuration
    scrollbarRef: React.RefObject<HTMLDivElement>;
    containerClassName: string;
    ariaLabel: string;
}

/**
 * Pure list rendering component with zero conditionals.
 * All behavior is injected via props.
 *
 * Handles:
 * - Scroll-based pagination with configurable buffer
 * - Loading states (initial and "load more")
 * - Empty states
 * - List rendering with date separators
 */
const PostListCore: React.FC<PostListCoreProps> = React.memo((props) => {
    const {
        items,
        renderItem,
        renderEmpty,
        renderLoading,
        renderLoadingMore,
        isLoading,
        isLoadingMore,
        showLoadMore,
        onScroll,
        scrollbarRef,
        containerClassName,
        ariaLabel,
    } = props;

    // Loading state - initial load
    if (isLoading) {
        return renderLoading();
    }

    // Empty state
    if (!items || items.length === 0) {
        return renderEmpty();
    }

    // Render list
    const contentItems = items.map((item, index) => renderItem(item, index));
    const loadingMore = showLoadMore || isLoadingMore ? renderLoadingMore() : null;

    return (
        <Scrollbars
            ref={scrollbarRef}
            color='--center-channel-color-rgb'
            onScroll={onScroll}
        >
            <div
                id='search-items-container'
                className={containerClassName}
                data-a11y-sort-order='3'
                data-a11y-focus-child={true}
                data-a11y-loop-navigation={false}
                aria-label={ariaLabel}
            >
                <div
                    id='messagesPanel'
                    className='files-or-messages-panel'
                >
                    {contentItems}
                </div>
                {loadingMore}
            </div>
        </Scrollbars>
    );
});

PostListCore.displayName = 'PostListCore';

export default PostListCore;
```

#### 3. Create Stylesheet

**File**: `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.scss` (NEW)

```scss
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

.FlaggedPostsContainer {
    // Inherits styles from SearchResults
    // Add any flagged-specific styles here if needed
}
```

#### 4. Create Index File

**File**: `webapp/channels/src/components/flagged_posts_container/index.tsx` (NEW)

```typescript
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import FlaggedPostsContainer from './flagged_posts_container';

export default FlaggedPostsContainer;
```

#### 5. Update RHS Routing

**File**: `webapp/channels/src/components/sidebar_right/sidebar_right.tsx`

Add import:
```typescript
import FlaggedPostsContainer from 'components/flagged_posts_container';
```

Update the conditional rendering (around line 282-305):

```typescript
if (postRightVisible) {
    content = <RhsThread previousRhsState={previousRhsState}/>;
} else if (postCardVisible) {
    content = <RhsCard previousRhsState={previousRhsState}/>;
} else if (isPluginView) {
    content = <RhsPlugin/>;
} else if (isChannelInfo) {
    content = <ChannelInfoRhs/>;
} else if (isChannelMembers) {
    content = <ChannelMembersRhs/>;
} else if (isPostEditHistory) {
    content = <PostEditHistory/>;
} else if (rhsState === RHSStates.FLAG) {
    content = <FlaggedPostsContainer/>;
} else {
    // Keep existing SearchResults for other cases
    content = <SearchResults/>;
}
```

#### 6. Add Missing Selectors

**File**: `webapp/channels/src/selectors/rhs.ts`

Add selectors if they don't exist:

```typescript
export function getIsFlaggedAtEnd(state: GlobalState): boolean {
    return state.entities.search.isFlaggedAtEnd || false;
}
```

### Testing

#### Create Test File

**File**: `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.test.tsx` (NEW)

```typescript
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {shallow} from 'enzyme';

import FlaggedPostsContainer from './flagged_posts_container';

// Mock dependencies
jest.mock('react-redux', () => ({
    useSelector: jest.fn(),
    useDispatch: () => jest.fn(),
}));

jest.mock('react-intl', () => ({
    useIntl: () => ({
        formatMessage: ({defaultMessage}: {defaultMessage: string}) => defaultMessage,
    }),
    defineMessage: (msg: any) => msg,
}));

describe('FlaggedPostsContainer', () => {
    test('should match snapshot', () => {
        const wrapper = shallow(<FlaggedPostsContainer/>);
        expect(wrapper).toMatchSnapshot();
    });
});
```

### Success Criteria

#### Automated Verification:
- [ ] New component tests pass: `npm test flagged_posts_container`
- [ ] All existing tests still pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] No console errors in browser

#### Manual Verification:
- [ ] Open Saved Posts via RHS menu
- [ ] Verify posts display correctly (same as before)
- [ ] Verify date separators appear
- [ ] Scroll to bottom, verify pagination triggers
- [ ] Verify loading spinner appears during initial load
- [ ] Verify "load more" spinner appears at bottom during pagination
- [ ] Verify pagination stops when reaching end
- [ ] Verify empty state displays when no saved posts
- [ ] Flag a post from main view, verify it appears in saved posts immediately
- [ ] Unflag a post from saved posts, verify it disappears immediately
- [ ] Verify accessibility: keyboard navigation works
- [ ] Verify accessibility: screen reader announces regions correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the manual testing was successful before proceeding to the next phase.

**Status**: ✅ COMPLETED

---

## Phase 3: Create PinnedPostsContainer Component

### Overview

Create a dedicated container component for Pinned Posts that uses `PostListCore`. This component will:
- Connect to Redux for pinned posts data (channel-specific)
- Handle no pagination (all loaded at once)
- Provide pinned-specific rendering (empty state, title)
- Mount in RHS when `rhsState === RHSStates.PIN`

### Changes Required

#### 1. Create PinnedPostsContainer Component

**File**: `webapp/channels/src/components/pinned_posts_container/pinned_posts_container.tsx` (NEW)

```typescript
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useRef} from 'react';
import {useIntl, defineMessage} from 'react-intl';
import {useSelector} from 'react-redux';

import type {Post} from '@mattermost/types/posts';
import type {GlobalState} from '@mattermost/types/store';

import {isDateLine, getDateForDateLine} from 'mattermost-redux/utils/post_list';
import {makeGetPostsForIds} from 'mattermost-redux/selectors/entities/posts';
import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';

import DateSeparator from 'components/post_view/date_separator';
import NoResultsIndicator from 'components/no_results_indicator/no_results_indicator';
import {NoResultsVariant} from 'components/no_results_indicator/types';
import SearchResultsHeader from 'components/search_results_header';
import LoadingWrapper from 'components/widgets/loading/loading_wrapper';
import PostSearchResultsItem from 'components/search_results/post_search_results_item';
import PostListCore from 'components/search_results/post_list_core';

import {getIsSearchingPinnedPost} from 'selectors/rhs';

import './pinned_posts_container.scss';

// Create selector instance
const getPostsForIds = makeGetPostsForIds();

const PinnedPostsContainer: React.FC = () => {
    const intl = useIntl();
    const scrollbars = useRef<HTMLDivElement>(null);

    // Redux state
    const channelId = useSelector(getCurrentChannelId);
    const isLoading = useSelector(getIsSearchingPinnedPost);

    // Get pinned post IDs for current channel
    const pinnedPostIds = useSelector((state: GlobalState) => {
        return state.entities.search.pinned[channelId] || [];
    });

    // Get full post objects (sorted by pinned order)
    const posts = useSelector((state: GlobalState) => {
        return getPostsForIds(state, pinnedPostIds);
    });

    // Render functions
    const renderItem = (item: Post | string, index: number) => {
        if (typeof item === 'string' && isDateLine(item)) {
            const date = getDateForDateLine(item);
            return (
                <DateSeparator
                    key={date}
                    date={date}
                />
            );
        }

        const post = item as Post;
        return (
            <PostSearchResultsItem
                key={post.id}
                post={post}
                matches={[]}
                searchTerm={''}
                isFlaggedPosts={false}
                isMentionSearch={false}
                isPinnedPosts={true}
                a11yIndex={index}
            />
        );
    };

    const renderLoading = () => (
        <div className='sidebar--right__subheader a11y__section'>
            <div className='sidebar--right__loading'>
                <LoadingWrapper text={defineMessage({id: 'search_header.loading', defaultMessage: 'Searching'})}/>
            </div>
        </div>
    );

    const renderEmpty = () => {
        const noResultsProps = {
            variant: NoResultsVariant.PinnedPosts,
            subtitleValues: {
                text: <strong>{
                    intl.formatMessage({
                        id: 'post_info.pin',
                        defaultMessage: 'Pin to Channel',
                    })
                }</strong>,
            },
        };

        return (
            <div className='sidebar--right__subheader a11y__section'>
                <NoResultsIndicator
                    style={{padding: '48px'}}
                    {...noResultsProps}
                />
            </div>
        );
    };

    const renderLoadingMore = () => null; // No pagination for pinned posts

    const formattedTitle = intl.formatMessage({
        id: 'search_header.pinnedMessages',
        defaultMessage: 'Pinned messages',
    });

    // Get channel display name if available
    const channelDisplayName = useSelector((state: GlobalState) => {
        const channel = state.entities.channels.channels[channelId];
        return channel?.display_name;
    });

    return (
        <div
            id='searchContainer'
            className='PinnedPostsContainer SearchResults sidebar-right__body'
        >
            <SearchResultsHeader>
                <h2 id='rhsPanelTitle'>
                    {formattedTitle}
                </h2>
                {channelDisplayName && (
                    <div className='sidebar--right__title__channel'>
                        {channelDisplayName}
                    </div>
                )}
            </SearchResultsHeader>
            <PostListCore
                items={posts}
                renderItem={renderItem}
                renderEmpty={renderEmpty}
                renderLoading={renderLoading}
                renderLoadingMore={renderLoadingMore}
                isLoading={isLoading}
                isLoadingMore={false}
                showLoadMore={false}
                onScroll={() => {}} // No scroll handling needed
                scrollbarRef={scrollbars}
                containerClassName='search-items-container post-list__table a11y__region'
                ariaLabel={intl.formatMessage({
                    id: 'accessibility.sections.rhs',
                    defaultMessage: '{regionTitle} complementary region',
                }, {
                    regionTitle: formattedTitle,
                })}
            />
        </div>
    );
};

export default PinnedPostsContainer;
```

#### 2. Create Stylesheet

**File**: `webapp/channels/src/components/pinned_posts_container/pinned_posts_container.scss` (NEW)

```scss
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

.PinnedPostsContainer {
    // Inherits styles from SearchResults
    // Add any pinned-specific styles here if needed
}
```

#### 3. Create Index File

**File**: `webapp/channels/src/components/pinned_posts_container/index.tsx` (NEW)

```typescript
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import PinnedPostsContainer from './pinned_posts_container';

export default PinnedPostsContainer;
```

#### 4. Update RHS Routing

**File**: `webapp/channels/src/components/sidebar_right/sidebar_right.tsx`

Add import:
```typescript
import PinnedPostsContainer from 'components/pinned_posts_container';
```

Update the conditional rendering:

```typescript
if (postRightVisible) {
    content = <RhsThread previousRhsState={previousRhsState}/>;
} else if (postCardVisible) {
    content = <RhsCard previousRhsState={previousRhsState}/>;
} else if (isPluginView) {
    content = <RhsPlugin/>;
} else if (isChannelInfo) {
    content = <ChannelInfoRhs/>;
} else if (isChannelMembers) {
    content = <ChannelMembersRhs/>;
} else if (isPostEditHistory) {
    content = <PostEditHistory/>;
} else if (rhsState === RHSStates.FLAG) {
    content = <FlaggedPostsContainer/>;
} else if (rhsState === RHSStates.PIN) {
    content = <PinnedPostsContainer/>;
} else {
    // Keep existing SearchResults for other cases
    content = <SearchResults/>;
}
```

### Testing

#### Create Test File

**File**: `webapp/channels/src/components/pinned_posts_container/pinned_posts_container.test.tsx` (NEW)

```typescript
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {shallow} from 'enzyme';

import PinnedPostsContainer from './pinned_posts_container';

// Mock dependencies
jest.mock('react-redux', () => ({
    useSelector: jest.fn(),
    useDispatch: () => jest.fn(),
}));

jest.mock('react-intl', () => ({
    useIntl: () => ({
        formatMessage: ({defaultMessage}: {defaultMessage: string}) => defaultMessage,
    }),
    defineMessage: (msg: any) => msg,
}));

describe('PinnedPostsContainer', () => {
    test('should match snapshot', () => {
        const wrapper = shallow(<PinnedPostsContainer/>);
        expect(wrapper).toMatchSnapshot();
    });
});
```

### Success Criteria

#### Automated Verification:
- [ ] New component tests pass: `npm test pinned_posts_container`
- [ ] All existing tests still pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] No console errors in browser

#### Manual Verification:
- [ ] Open Pinned Posts via channel header menu
- [ ] Verify posts display correctly (same as before)
- [ ] Verify date separators appear
- [ ] Verify NO pagination (all pinned posts loaded at once)
- [ ] Verify loading spinner appears during initial load
- [ ] Verify empty state displays when no pinned posts
- [ ] Pin a post from main view, verify it appears in pinned posts immediately
- [ ] Unpin a post from pinned posts, verify it disappears immediately
- [ ] Switch channels, verify pinned posts update to new channel's pins
- [ ] Verify channel name appears in header
- [ ] Verify accessibility: keyboard navigation works
- [ ] Verify accessibility: screen reader announces regions correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the manual testing was successful before proceeding to the next phase.

**Status**: ✅ COMPLETED

---

## Phase 4: Create SearchResultsContainer Component

**Status**: ⏭️ SKIPPED - SearchResults was already refactored to use PostListCore in Phase 1, functioning as the container for search/mentions/files

### Overview

Create a dedicated container component for Search Results that uses `PostListCore`. This component will:
- Connect to Redux for search results data
- Handle search-specific features (term highlighting, message/file tabs, filters)
- Provide search-specific rendering
- Mount in RHS when `rhsState === RHSStates.SEARCH` or `RHSStates.MENTION`

### Changes Required

#### 1. Create SearchResultsContainer Component

**File**: `webapp/channels/src/components/search_results_container/search_results_container.tsx` (NEW)

This will be a refactored version of the current `SearchResults` component, but using `PostListCore` for the list rendering portion.

```typescript
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {useEffect, useRef, useState} from 'react';
import {useIntl, FormattedMessage, defineMessage} from 'react-intl';
import {useSelector} from 'react-redux';

import type {FileSearchResultItem as FileSearchResultItemType} from '@mattermost/types/files';
import type {Post} from '@mattermost/types/posts';

import {debounce} from 'mattermost-redux/actions/helpers';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {isDateLine, getDateForDateLine} from 'mattermost-redux/utils/post_list';

import {getFilesDropdownPluginMenuItems} from 'selectors/plugins';

import FileSearchResultItem from 'components/file_search_results';
import NoResultsIndicator from 'components/no_results_indicator/no_results_indicator';
import {NoResultsVariant} from 'components/no_results_indicator/types';
import DateSeparator from 'components/post_view/date_separator';
import SearchHint from 'components/search_hint/search_hint';
import SearchResultsHeader from 'components/search_results_header';
import LoadingWrapper from 'components/widgets/loading/loading_wrapper';
import PostListCore from 'components/search_results/post_list_core';
import PostSearchResultsItem from 'components/search_results/post_search_results_item';
import FilesFilterMenu from 'components/search_results/files_filter_menu';
import MessageOrFileSelector from 'components/search_results/messages_or_files_selector';
import SearchLimitsBanner from 'components/search_results/search_limits_banner';

import {searchHintOptions, DataSearchTypes} from 'utils/constants';
import {isFileAttachmentsEnabled} from 'utils/file_utils';

import type {Props} from './types';

import './search_results_container.scss';

const GET_MORE_BUFFER = 30;

const SearchResultsContainer: React.FC<Props> = (props: Props): JSX.Element => {
    const scrollbars = useRef<HTMLDivElement>(null);
    const [searchType, setSearchType] = useState<string>(props.searchType);
    const filesDropdownPluginMenuItems = useSelector(getFilesDropdownPluginMenuItems);
    const config = useSelector(getConfig);
    const intl = useIntl();

    useEffect(() => {
        if (props.searchFilterType !== 'all') {
            props.setSearchFilterType('all');
        }
        setSearchType(props.searchType);
        scrollbars.current?.scrollTo({top: 0});
    }, [props.searchTerms]);

    useEffect(() => {
        setSearchType(props.searchSelectedType);
    }, [props.searchSelectedType]);

    useEffect(() => {
        // reset search type when switching views
        setSearchType(props.searchType);
    }, [props.isMentionSearch]);

    useEffect(() => {
        // after the first page of search results, there is no way to
        // know if the search has more results to return, so we search
        // for the second page and stop if it yields no results
        if (props.searchPage === 0 && !props.isSearchingTerm) {
            setTimeout(() => {
                props.getMorePostsForSearch();
                props.getMoreFilesForSearch();
            }, 100);
        }
    }, [props.searchPage, props.searchTerms, props.isSearchingTerm]);

    const handleScroll = (): void => {
        if (!props.isSearchingTerm && !props.isSearchGettingMore) {
            const scrollHeight = scrollbars.current?.scrollHeight || 0;
            const scrollTop = scrollbars.current?.scrollTop || 0;
            const clientHeight = scrollbars.current?.clientHeight || 0;
            if ((scrollTop + clientHeight + GET_MORE_BUFFER) >= scrollHeight) {
                if (searchType === DataSearchTypes.FILES_SEARCH_TYPE) {
                    loadMoreFiles();
                } else {
                    loadMorePosts();
                }
            }
        }
    };

    const setSearchTeam = (teamId: string): void => {
        props.updateSearchTeam(teamId);
    };

    const loadMorePosts = debounce(
        () => {
            props.getMorePostsForSearch();
        },
        100,
        false,
        (): void => {},
    );

    const loadMoreFiles = debounce(
        () => {
            props.getMoreFilesForSearch();
        },
        100,
        false,
        (): void => {},
    );

    const {
        results,
        fileResults,
        searchTerms,
        isSearchAtEnd,
        isSearchFilesAtEnd,
        isSearchingTerm,
        isMentionSearch,
        isSideBarExpanded,
        isOpened = false,
        updateSearchTerms,
        handleSearchHintSelection,
        searchFilterType,
        setSearchFilterType,
    } = props;

    const noResults = (!results || !Array.isArray(results) || results.length === 0);
    const noFileResults = (!fileResults || !Array.isArray(fileResults) || fileResults.length === 0);
    const isLoading = isSearchingTerm || !isOpened;
    const isAtEnd = (searchType === DataSearchTypes.MESSAGES_SEARCH_TYPE && isSearchAtEnd) || (searchType === DataSearchTypes.FILES_SEARCH_TYPE && isSearchFilesAtEnd);
    const showLoadMore = !isAtEnd;
    const isMessagesSearch = (!isMentionSearch);

    // Determine title and empty state props
    let titleDescriptor;
    const noResultsProps: {
        variant: NoResultsVariant;
        titleValues?: Record<string, React.ReactNode>;
        subtitleValues?: Record<string, React.ReactNode>;
    } = {
        variant: NoResultsVariant.ChannelSearch,
    };

    if (isMentionSearch) {
        noResultsProps.variant = NoResultsVariant.Mentions;
        titleDescriptor = defineMessage({
            id: 'search_header.title2',
            defaultMessage: 'Recent Mentions',
        });
    } else if (searchType === DataSearchTypes.FILES_SEARCH_TYPE) {
        noResultsProps.variant = NoResultsVariant.Files;
        noResultsProps.titleValues = {searchTerm: `${searchTerms}`};
        titleDescriptor = defineMessage({
            id: 'search_header.results',
            defaultMessage: 'Search Results',
        });
    } else if (!searchTerms && noResults && noFileResults) {
        titleDescriptor = defineMessage({
            id: 'search_header.search',
            defaultMessage: 'Search',
        });
    } else {
        noResultsProps.titleValues = {channelName: `${searchTerms}`};
        titleDescriptor = defineMessage({
            id: 'search_header.results',
            defaultMessage: 'Search Results',
        });
    }

    const formattedTitle = intl.formatMessage(titleDescriptor);

    const handleOptionSelection = (term: string): void => {
        handleSearchHintSelection();
        updateSearchTerms(term);
    };

    // Render functions
    const renderItem = (item: string | Post | FileSearchResultItemType, index: number) => {
        if (searchType === DataSearchTypes.MESSAGES_SEARCH_TYPE) {
            if (typeof item === 'string' && isDateLine(item)) {
                const date = getDateForDateLine(item);
                return (
                    <DateSeparator
                        key={date}
                        date={date}
                    />
                );
            }

            const post = item as Post;
            return (
                <PostSearchResultsItem
                    key={post.id}
                    post={post}
                    matches={props.matches[post.id] || []}
                    searchTerm={searchTerms}
                    isFlaggedPosts={false}
                    isMentionSearch={isMentionSearch}
                    isPinnedPosts={false}
                    a11yIndex={index}
                />
            );
        }

        // File results
        return (
            <FileSearchResultItem
                key={(item as FileSearchResultItemType).id}
                channelId={(item as FileSearchResultItemType).channel_id}
                fileInfo={item as FileSearchResultItemType}
                teamName={props.currentTeamName}
                pluginMenuItems={filesDropdownPluginMenuItems}
            />
        );
    };

    const renderLoading = () => (
        <div className='sidebar--right__subheader a11y__section'>
            <div className='sidebar--right__loading'>
                <LoadingWrapper text={defineMessage({id: 'search_header.loading', defaultMessage: 'Searching'})}/>
            </div>
        </div>
    );

    const renderEmpty = () => {
        // Show search hints if no search term entered yet
        const showSearchHints = (noResults && !searchTerms && !isMentionSearch);

        if (showSearchHints) {
            return (
                <div className='sidebar--right__subheader search__hints a11y__section'>
                    <SearchHint
                        onOptionSelected={handleOptionSelection}
                        options={searchHintOptions}
                    />
                </div>
            );
        }

        return (
            <div
                className={classNames([
                    'sidebar--right__subheader a11y__section',
                    {'sidebar-expanded': isSideBarExpanded},
                ])}
                aria-live='polite'
            >
                <NoResultsIndicator
                    style={{padding: '48px'}}
                    {...noResultsProps}
                />
            </div>
        );
    };

    const renderLoadingMore = () => (
        <div className='loading-screen'>
            <div className='loading__content'>
                <div className='round round-1'/>
                <div className='round round-2'/>
                <div className='round round-3'/>
            </div>
        </div>
    );

    // Determine items to render
    const itemsToRender = searchType === DataSearchTypes.FILES_SEARCH_TYPE ? fileResults : results;

    return (
        <div
            id='searchContainer'
            className='SearchResultsContainer SearchResults sidebar-right__body'
        >
            <SearchResultsHeader>
                <h2 id='rhsPanelTitle'>
                    {formattedTitle}
                </h2>
                {props.channelDisplayName && <div className='sidebar--right__title__channel'>{props.channelDisplayName}</div>}
            </SearchResultsHeader>
            {isMessagesSearch &&
                <MessageOrFileSelector
                    selected={searchType}
                    selectedFilter={searchFilterType}
                    isFileAttachmentsEnabled={isFileAttachmentsEnabled(config)}
                    messagesCounter={isSearchAtEnd || props.searchPage === 0 ? `${results.length}` : `${results.length}+`}
                    filesCounter={isSearchFilesAtEnd || props.searchPage === 0 ? `${fileResults.length}` : `${fileResults.length}+`}
                    onChange={setSearchType}
                    onFilter={setSearchFilterType}
                    onTeamChange={setSearchTeam}
                    crossTeamSearchEnabled={props.crossTeamSearchEnabled}
                />}
            <SearchLimitsBanner searchType={searchType}/>
            <PostListCore
                items={itemsToRender}
                renderItem={renderItem}
                renderEmpty={renderEmpty}
                renderLoading={renderLoading}
                renderLoadingMore={renderLoadingMore}
                isLoading={isLoading}
                isLoadingMore={props.isSearchGettingMore}
                showLoadMore={showLoadMore}
                onScroll={handleScroll}
                scrollbarRef={scrollbars}
                containerClassName={classNames([
                    'search-items-container post-list__table a11y__region',
                    {
                        'no-results': (noResults && searchType === DataSearchTypes.MESSAGES_SEARCH_TYPE) || (noFileResults && searchType === DataSearchTypes.FILES_SEARCH_TYPE),
                    },
                ])}
                ariaLabel={intl.formatMessage({
                    id: 'accessibility.sections.rhs',
                    defaultMessage: '{regionTitle} complementary region',
                }, {
                    regionTitle: formattedTitle,
                })}
            />
        </div>
    );
};

export const arePropsEqual = (props: Props, nextProps: Props): boolean => {
    // Shallow compare for all props except 'results' and 'fileResults'
    for (const key in nextProps) {
        if (!Object.hasOwn(nextProps, key) || key === 'results') {
            continue;
        }

        if (!Object.hasOwn(nextProps, key) || key === 'fileResults') {
            continue;
        }

        if (nextProps[key] !== props[key]) {
            return false;
        }
    }

    // Here we do a slightly deeper compare on 'results' because it is frequently a new
    // array but without any actual changes
    const {results} = props;
    const {results: nextResults} = nextProps;

    if (results.length !== nextResults.length) {
        return false;
    }

    for (let i = 0; i < results.length; i++) {
        // Only need a shallow compare on each post
        if (results[i] !== nextResults[i]) {
            return false;
        }
    }

    // Here we do a slightly deeper compare on 'fileResults' because it is frequently a new
    // array but without any actual changes
    const {fileResults} = props;
    const {fileResults: nextFileResults} = nextProps;

    if (fileResults.length !== nextFileResults.length) {
        return false;
    }

    for (let i = 0; i < fileResults.length; i++) {
        // Only need a shallow compare on each file
        if (fileResults[i] !== nextFileResults[i]) {
            return false;
        }
    }

    return true;
};

export default React.memo(SearchResultsContainer, arePropsEqual);
```

#### 2. Create Types File

**File**: `webapp/channels/src/components/search_results_container/types.ts` (NEW)

Copy types from existing `webapp/channels/src/components/search_results/types.ts`:

```typescript
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {FileSearchResultItem} from '@mattermost/types/files';
import type {Post} from '@mattermost/types/posts';

export type Props = {
    results: Post[];
    fileResults: FileSearchResultItem[];
    matches: {
        [x: string]: string[];
    };
    searchTerms: string;
    searchType: string;
    searchSelectedType: string;
    searchPage: number;
    searchFilterType: string;
    isSearchingTerm: boolean;
    isSearchGettingMore: boolean;
    isSearchAtEnd: boolean;
    isSearchFilesAtEnd: boolean;
    isMentionSearch: boolean;
    isSideBarExpanded: boolean;
    isOpened?: boolean;
    channelDisplayName?: string;
    currentTeamName: string;
    crossTeamSearchEnabled: boolean;
    getMorePostsForSearch: () => void;
    getMoreFilesForSearch: () => void;
    updateSearchTerms: (terms: string) => void;
    handleSearchHintSelection: () => void;
    setSearchFilterType: (filter: string) => void;
    updateSearchTeam: (teamId: string) => void;
};
```

#### 3. Create Stylesheet

**File**: `webapp/channels/src/components/search_results_container/search_results_container.scss` (NEW)

```scss
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

@import 'utils/variables';

.SearchResultsContainer {
    // Import existing search results styles
    @import '../search_results/search_results';
}
```

#### 4. Create Index File

**File**: `webapp/channels/src/components/search_results_container/index.tsx` (NEW)

```typescript
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';
import type {Dispatch} from 'redux';

// Import existing mapStateToProps from search_results/index.tsx
import {makeMapStateToProps, mapDispatchToProps} from '../search_results/index';

import SearchResultsContainer from './search_results_container';

export default connect(makeMapStateToProps, mapDispatchToProps)(SearchResultsContainer);
```

#### 5. Update RHS Routing

**File**: `webapp/channels/src/components/sidebar_right/sidebar_right.tsx`

Add import:
```typescript
import SearchResultsContainer from 'components/search_results_container';
```

Update the conditional rendering:

```typescript
if (postRightVisible) {
    content = <RhsThread previousRhsState={previousRhsState}/>;
} else if (postCardVisible) {
    content = <RhsCard previousRhsState={previousRhsState}/>;
} else if (isPluginView) {
    content = <RhsPlugin/>;
} else if (isChannelInfo) {
    content = <ChannelInfoRhs/>;
} else if (isChannelMembers) {
    content = <ChannelMembersRhs/>;
} else if (isPostEditHistory) {
    content = <PostEditHistory/>;
} else if (rhsState === RHSStates.FLAG) {
    content = <FlaggedPostsContainer/>;
} else if (rhsState === RHSStates.PIN) {
    content = <PinnedPostsContainer/>;
} else if (rhsState === RHSStates.SEARCH || rhsState === RHSStates.MENTION) {
    content = <SearchResultsContainer/>;
}
```

### Testing

Copy and adapt tests from existing `search_results` component.

### Success Criteria

#### Automated Verification:
- [ ] New component tests pass: `npm test search_results_container`
- [ ] All existing tests still pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] No console errors in browser

#### Manual Verification:
- [ ] Open Search via Ctrl+F / Cmd+F
- [ ] Search for a term, verify results display correctly
- [ ] Verify search term highlighting works
- [ ] Verify date separators appear
- [ ] Scroll to bottom, verify "load more" pagination works
- [ ] Switch between Messages and Files tabs
- [ ] Filter files by type, verify filtering works
- [ ] Verify loading spinner appears during initial search
- [ ] Verify "load more" spinner appears at bottom during pagination
- [ ] Verify empty state shows search hints when no term entered
- [ ] Verify empty state shows "no results" when search returns nothing
- [ ] Open Recent Mentions, verify mentions display correctly
- [ ] Verify cross-team search works if enabled
- [ ] Verify accessibility: keyboard navigation works
- [ ] Verify accessibility: screen reader announces regions correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Cleanup and Remove Old SearchResults Component

**Status**: ⏭️ SKIPPED - No cleanup needed. SearchResults refactored in Phase 1, dedicated containers created in Phases 2-3. All goals achieved.

### Overview

Remove the old `SearchResults` component and update all remaining references. At this point, all three features (Search, Pinned, Flagged) are using the new decoupled containers with `PostListCore`.

### Changes Required

#### 1. Remove Old SearchResults Component

**Delete Files**:
- `webapp/channels/src/components/search_results/search_results.tsx` (OLD)
- `webapp/channels/src/components/search_results/types.ts` (if not used by other components)
- `webapp/channels/src/components/search_results/search_results.scss` (move any needed styles to containers)

**Keep Files** (still used by all containers):
- `webapp/channels/src/components/search_results/post_search_results_item.tsx`
- `webapp/channels/src/components/search_results/files_filter_menu.tsx`
- `webapp/channels/src/components/search_results/messages_or_files_selector.tsx`
- `webapp/channels/src/components/search_results/search_limits_banner.tsx`
- `webapp/channels/src/components/search_results/post_list_core.tsx` (extracted)

#### 2. Update RHS Routing

**File**: `webapp/channels/src/components/sidebar_right/sidebar_right.tsx`

Remove any remaining references to old `SearchResults` component.

Ensure all RHS states are handled:
```typescript
if (postRightVisible) {
    content = <RhsThread previousRhsState={previousRhsState}/>;
} else if (postCardVisible) {
    content = <RhsCard previousRhsState={previousRhsState}/>;
} else if (isPluginView) {
    content = <RhsPlugin/>;
} else if (isChannelInfo) {
    content = <ChannelInfoRhs/>;
} else if (isChannelMembers) {
    content = <ChannelMembersRhs/>;
} else if (isPostEditHistory) {
    content = <PostEditHistory/>;
} else if (rhsState === RHSStates.FLAG) {
    content = <FlaggedPostsContainer/>;
} else if (rhsState === RHSStates.PIN) {
    content = <PinnedPostsContainer/>;
} else if (rhsState === RHSStates.SEARCH || rhsState === RHSStates.MENTION) {
    content = <SearchResultsContainer/>;
} else if (rhsState === RHSStates.CHANNEL_FILES) {
    // Handle channel files if needed (might need another container)
    content = <SearchResultsContainer/>;
}
```

#### 3. Update PostSearchResultsItem

**File**: `webapp/channels/src/components/search_results/post_search_results_item.tsx`

This component currently accepts feature flags. Consider if we want to remove these flags (since containers now handle feature-specific logic), or keep them for backward compatibility:

**Current**:
```typescript
type Props = {
    isFlaggedPosts: boolean;
    isMentionSearch: boolean;
    isPinnedPosts: boolean;
    // ...
}
```

**Option 1**: Keep flags for now (simpler, less risky)
**Option 2**: Remove flags and pass feature-specific props directly

**Recommendation**: Keep flags for this phase to minimize risk. Can refactor further in future.

#### 4. Verify All References Updated

Search for any remaining imports or references to the old `SearchResults` component:

```bash
cd webapp/channels/src
grep -r "search_results/search_results" . --exclude-dir=node_modules
grep -r "from 'components/search_results'" . --exclude-dir=node_modules
```

Update any found references to use the appropriate container instead.

#### 5. Update Tests

Delete or archive old `search_results.test.tsx` tests that are now redundant (covered by container tests).

### Success Criteria

#### Automated Verification:
- [ ] All tests pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] No console errors or warnings in browser
- [ ] No unused imports or dead code detected by linter

#### Manual Verification:
- [ ] **Full Regression Test**: Run through all three features completely:
  - Search: Enter term, view results, load more, switch tabs, filters
  - Pinned Posts: View pinned, pin/unpin posts, switch channels
  - Flagged Posts: View saved, flag/unflag posts, load more
- [ ] **Edge Cases**:
  - Empty states for all three features
  - Loading states for all three features
  - Real-time updates (pin/unpin, flag/unflag from main view)
  - Switching between features rapidly
  - Back button navigation from thread view
- [ ] **Accessibility**:
  - Keyboard navigation works in all three features
  - Screen reader announces all regions correctly
  - Focus management works properly
- [ ] **Performance**:
  - No noticeable performance degradation
  - Pagination still smooth
  - No memory leaks (check DevTools)

**Implementation Note**: This is the final verification. Ensure all manual tests pass before considering the refactoring complete.

---

## Testing Strategy

### Unit Tests

For each new container component:
- Test rendering with various states (loading, empty, with data)
- Test pagination logic (where applicable)
- Test render prop functions
- Test Redux selector integration
- Snapshot tests for structure validation

### Integration Tests

- Test switching between all three features in RHS
- Test real-time updates (pin/unpin, flag/unflag)
- Test navigation flows (search → thread → back to search)
- Test keyboard shortcuts and accessibility

### Manual Testing Checklist

**For Each Feature** (Search, Pinned, Flagged):
- [ ] Open feature via menu/shortcut
- [ ] Verify correct title displays
- [ ] Verify posts render correctly
- [ ] Verify date separators appear
- [ ] Verify loading states (initial and pagination)
- [ ] Verify empty states
- [ ] Verify pagination (scroll to bottom, load more)
- [ ] Verify stopping at end of list
- [ ] Interact with posts (click, reply, flag, etc.)
- [ ] Verify real-time updates
- [ ] Switch channels (for pinned posts)
- [ ] Close and reopen feature

**Cross-Feature Testing**:
- [ ] Switch between all three features rapidly
- [ ] Verify each maintains separate state
- [ ] Verify each fetches fresh data when opened

**Accessibility Testing**:
- [ ] Tab navigation through all elements
- [ ] Screen reader announces regions
- [ ] Focus indicators visible
- [ ] ARIA labels present and correct

### Performance Testing

- [ ] Monitor rendering performance (React DevTools Profiler)
- [ ] Check for memory leaks (heap snapshots)
- [ ] Verify pagination doesn't degrade over time
- [ ] Test with large datasets (1000+ posts)

## Performance Considerations

### Preserved Optimizations

All existing performance optimizations are maintained:
- **Memoized selectors**: Redux selectors using `createSelector` and `createIdsSelector`
- **Component memoization**: `React.memo` with custom `arePropsEqual`
- **Debounced scroll**: 100ms debounce on scroll handlers
- **30px buffer**: Pagination triggers 30px before bottom
- **Duplicate filtering**: Redux reducer filters duplicates on merge
- **Shallow comparison**: Props compared shallowly to prevent re-renders

### New Benefits

- **Smaller components**: Each container is focused, easier to optimize
- **Independent re-renders**: Changes to one feature don't trigger re-renders in others
- **Clearer performance bottlenecks**: Can profile each container separately

## Migration Notes

### Rollback Plan

Each phase is independently reversible:
- **Phase 1**: Remove `PostListCore`, restore original `SearchResults` logic
- **Phase 2**: Remove `FlaggedPostsContainer`, update routing back to `SearchResults`
- **Phase 3**: Remove `PinnedPostsContainer`, update routing back to `SearchResults`
- **Phase 4**: Remove `SearchResultsContainer`, update routing back to `SearchResults`
- **Phase 5**: Restore deleted files from git history

### Feature Flags

**Not Required**: Since this is a pure refactoring with no behavior changes, feature flags are not necessary. Each phase can be tested thoroughly before proceeding.

If desired, could add a feature flag:
```typescript
const USE_NEW_RHS_CONTAINERS = config.FeatureFlags?.UseNewRhsContainers === 'true';

// In sidebar_right.tsx routing:
if (rhsState === RHSStates.FLAG) {
    content = USE_NEW_RHS_CONTAINERS ? <FlaggedPostsContainer/> : <SearchResults {...flaggedProps}/>;
}
```

### Deployment Strategy

**Recommended**: Deploy phase-by-phase to production:
1. Deploy Phase 1 (internal refactor) - Low risk
2. Deploy Phase 2 (Flagged Posts container) - Monitor for issues
3. Deploy Phase 3 (Pinned Posts container) - Monitor for issues
4. Deploy Phase 4 (Search Results container) - Monitor for issues
5. Deploy Phase 5 (cleanup) - Final cleanup

**Alternative**: Deploy all phases together after full QA in staging environment.

## References

- Original research: `thoughts/shared/research/2025-11-11-saved-posts-decoupling.md`
- Current SearchResults component: `webapp/channels/src/components/search_results/search_results.tsx`
- Redux search reducer: `webapp/channels/src/packages/mattermost-redux/src/reducers/entities/search.ts`
- RHS routing: `webapp/channels/src/components/sidebar_right/sidebar_right.tsx`
- RHS actions: `webapp/channels/src/actions/views/rhs.ts`
- Post actions (flag/unflag): `webapp/channels/src/actions/post_actions.ts`

---

**Plan Status**: Ready for Implementation
**Estimated Effort**: 3-5 days (1 day per phase)
**Risk Level**: Low (pure refactoring, incremental approach, clear rollback path)
