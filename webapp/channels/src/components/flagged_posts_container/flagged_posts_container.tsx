// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useRef} from 'react';
import {useIntl, defineMessage} from 'react-intl';
import {useSelector, useDispatch} from 'react-redux';

import type {Post} from '@mattermost/types/posts';

import {debounce} from 'mattermost-redux/actions/helpers';
import {getMoreFlaggedPosts} from 'mattermost-redux/actions/search';
import {isDateLine, getDateForDateLine} from 'mattermost-redux/utils/post_list';

import {
    getFlaggedPosts,
    getIsSearchingFlaggedPost,
    getIsGettingMoreFlaggedPosts,
    getIsFlaggedAtEnd,
} from 'selectors/rhs';

import NoResultsIndicator from 'components/no_results_indicator/no_results_indicator';
import {NoResultsVariant} from 'components/no_results_indicator/types';
import DateSeparator from 'components/post_view/date_separator';
import PostListCore from 'components/search_results/post_list_core';
import PostSearchResultsItem from 'components/search_results/post_search_results_item';
import SearchLimitsBanner from 'components/search_results/search_limits_banner';
import SearchResultsHeader from 'components/search_results_header';
import Input from 'components/widgets/inputs/input/input';
import LoadingWrapper from 'components/widgets/loading/loading_wrapper';

import {useFlaggedPostsSearch} from './use_flagged_posts_search';

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

    // Search functionality (SERVER-SIDE)
    const {
        inputValue,
        searchTerm,
        searchInputSuffix,
        handleInputChange,
    } = useFlaggedPostsSearch();

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
                searchTerm={searchTerm}
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
        const hasSearchTerm = searchTerm.trim().length > 0;

        const noResultsProps = {
            variant: hasSearchTerm ?
                NoResultsVariant.ChannelSearch : // "No results found"
                NoResultsVariant.FlaggedPosts, // "No saved messages yet"
            titleValues: hasSearchTerm ? {channelName: searchTerm} : undefined,
            subtitleValues: hasSearchTerm ? undefined : {
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
            <div style={{padding: '12px 20px'}}>
                <Input
                    data-testid='flagged-posts-search'
                    value={inputValue}
                    onInput={(e) => handleInputChange(e.currentTarget.value)}
                    inputPrefix={<i className='icon icon-magnify'/>}
                    inputSuffix={searchInputSuffix}
                    placeholder={intl.formatMessage({
                        id: 'flagged_posts.search_bar.placeholder',
                        defaultMessage: 'Search saved messages',
                    })}
                    useLegend={false}
                />
            </div>
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
