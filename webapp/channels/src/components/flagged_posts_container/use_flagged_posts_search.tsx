// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useEffect, useRef} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch} from 'react-redux';

import {getFlaggedPosts} from 'mattermost-redux/actions/search';

import Constants from 'utils/constants';

interface UseFlaggedPostsSearchResult {
    inputValue: string;
    searchTerm: string;
    searchInputSuffix: JSX.Element | undefined;
    handleInputChange: (value: string) => void;
    handleClearSearch: () => void;
}

export function useFlaggedPostsSearch(): UseFlaggedPostsSearchResult {
    const intl = useIntl();
    const dispatch = useDispatch();

    // Search state: inputValue updates immediately, searchTerm updates after debounce
    const [inputValue, setInputValue] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const searchTimeoutId = useRef<number>(0);
    const hasSearchedRef = useRef(false);

    // Debounce search term updates and trigger SERVER-SIDE search
    useEffect(() => {
        clearTimeout(searchTimeoutId.current);

        searchTimeoutId.current = window.setTimeout(() => {
            const trimmedValue = inputValue.trim();
            setSearchTerm(inputValue);

            // Dispatch if:
            // 1. User has typed something (trimmedValue !== '')
            // 2. User cleared a previous search (trimmedValue === '' && hasSearchedRef.current === true)
            // Skip initial mount when both are empty (let RHS routing handle initial load)
            if (trimmedValue !== '' || hasSearchedRef.current) {
                dispatch(getFlaggedPosts(trimmedValue));
                hasSearchedRef.current = trimmedValue !== '';
            }
        }, Constants.SEARCH_TIMEOUT_MILLISECONDS);

        return () => {
            clearTimeout(searchTimeoutId.current);
        };
    }, [inputValue, dispatch]);

    // Clear button handler
    const handleClearSearch = () => {
        setInputValue('');
        setSearchTerm('');
        hasSearchedRef.current = false;
        // Reload all flagged posts (no search term)
        dispatch(getFlaggedPosts(''));
    };

    // Input change handler
    const handleInputChange = (value: string) => {
        setInputValue(value);
    };

    // Clear button for search input
    const searchInputSuffix = inputValue ? (
        <button
            className='style--none'
            onClick={handleClearSearch}
            aria-label={intl.formatMessage({
                id: 'flagged_posts.search_bar.clear',
                defaultMessage: 'Clear search',
            })}
        >
            <i className='icon icon-close-circle'/>
        </button>
    ) : undefined;

    return {
        inputValue,
        searchTerm,
        searchInputSuffix,
        handleInputChange,
        handleClearSearch,
    };
}
