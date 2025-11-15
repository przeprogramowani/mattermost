// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useRef} from 'react';
import {useIntl, defineMessage} from 'react-intl';
import {useSelector} from 'react-redux';

import type {Post} from '@mattermost/types/posts';
import type {GlobalState} from '@mattermost/types/store';

import {isDateLine, getDateForDateLine} from 'mattermost-redux/utils/post_list';
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

    // Get full post objects from the pinned IDs
    const posts = useSelector((state: GlobalState) => {
        const allPosts = state.entities.posts.posts;
        return pinnedPostIds.map((id: string) => allPosts[id]).filter((post: Post) => post);
    });

    // Render functions
    const renderItem = (item: any, index: number) => {
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
