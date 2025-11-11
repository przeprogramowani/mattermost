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
