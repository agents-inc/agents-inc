import { useCallback, useState } from "react";
import type { BoundSkillCandidate, SkillAlias } from "../../types/index.js";
import { matrix } from "../../lib/matrix/matrix-provider.js";
import { useModalState } from "./use-modal-state.js";
import type { SourceRow } from "../wizard/source-grid.js";

type UseSourceGridSearchModalOptions = {
  rows: SourceRow[];
  onSearch?: (alias: SkillAlias) => Promise<BoundSkillCandidate[]>;
  onBind?: (candidate: BoundSkillCandidate) => void;
  onSearchStateChange?: (active: boolean) => void;
};

type UseSourceGridSearchModalResult = {
  searchModal: { isOpen: boolean };
  searchResults: BoundSkillCandidate[];
  searchAlias: string;
  handleSearchTrigger: (rowIndex: number) => Promise<void>;
  handleBind: (candidate: BoundSkillCandidate) => void;
  handleCloseSearch: () => void;
};

export function useSourceGridSearchModal({
  rows,
  onSearch,
  onBind,
  onSearchStateChange,
}: UseSourceGridSearchModalOptions): UseSourceGridSearchModalResult {
  const searchModal = useModalState<number>();
  const [searchResults, setSearchResults] = useState<BoundSkillCandidate[]>([]);
  const [searchAlias, setSearchAlias] = useState("");

  const resetSearch = useCallback(() => {
    searchModal.close();
    setSearchResults([]);
    setSearchAlias("");
    onSearchStateChange?.(false);
  }, [onSearchStateChange, searchModal]);

  const handleSearchTrigger = useCallback(
    async (rowIndex: number) => {
      const row = rows[rowIndex];
      if (!row || !onSearch) return;

      const alias = matrix.slugMap.idToSlug[row.skillId];
      if (!alias) return;
      setSearchAlias(alias);
      searchModal.open(rowIndex);
      onSearchStateChange?.(true);

      const results = await onSearch(alias);
      setSearchResults(results);
    },
    [rows, onSearch, onSearchStateChange, searchModal],
  );

  const handleBind = useCallback(
    (candidate: BoundSkillCandidate) => {
      onBind?.(candidate);
      resetSearch();
    },
    [onBind, resetSearch],
  );

  const handleCloseSearch = useCallback(() => {
    resetSearch();
  }, [resetSearch]);

  return {
    searchModal: { isOpen: searchModal.isOpen },
    searchResults,
    searchAlias,
    handleSearchTrigger,
    handleBind,
    handleCloseSearch,
  };
}
