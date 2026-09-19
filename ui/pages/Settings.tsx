'use client';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';

import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { MultiSelect } from '../components/MultiSelect';
import { TagInput } from '../components/TagInput';
import {
  useProfile,
  useProfileOptions,
  useUpdateProfile,
} from '../hooks/useProfile';
import type { Profile } from '../types/profile';

export function Settings() {
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
  } = useProfile();
  const {
    data: options,
    isLoading: optionsLoading,
    isError: optionsError,
  } = useProfileOptions();
  const { mutate: save, isPending } = useUpdateProfile();

  const [draft, setDraft] = useState<Profile | null>(null);

  useEffect(() => {
    if (profile !== undefined) setDraft(profile);
  }, [profile]);

  if (profileError || optionsError)
    return <p role="alert">Could not load your settings. Refresh to retry.</p>;

  if (
    profileLoading ||
    optionsLoading ||
    draft === null ||
    options === undefined
  ) {
    return <LoadingSkeleton count={3} />;
  }

  function patch(partial: Partial<Profile>) {
    setDraft((d) => (d === null ? d : { ...d, ...partial }));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Relevance profile
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Your preferences control your inbox and new-job alerts. Other users
          have their own settings.
        </p>
      </div>

      <div className="space-y-5 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <TagInput
          label="Companies (exact names; any match)"
          tags={draft.companies ?? []}
          onChange={(companies) => patch({ companies })}
        />
        <TagInput
          label="Company keywords (name or tracked sector; any match)"
          tags={draft.companyKeywords ?? []}
          onChange={(companyKeywords) => patch({ companyKeywords })}
        />
        <p className="text-sm text-gray-500">
          A company must match either a listed name or a keyword. Leave both
          blank for all companies. Sector matching is available for companies in
          our tracked catalogue.
        </p>
        <TagInput
          label="Job title / description keywords (any match)"
          tags={draft.jobKeywords ?? []}
          onChange={(jobKeywords) => patch({ jobKeywords })}
        />
        <MultiSelect
          label="Role families"
          options={options.roleFamilies}
          selected={draft.roleFamilies}
          onChange={(roleFamilies) => patch({ roleFamilies })}
        />
        <MultiSelect
          label="Seniority"
          options={options.seniorities}
          selected={draft.seniorities}
          onChange={(seniorities) => patch({ seniorities })}
        />
        <MultiSelect
          label="Tech stack"
          options={options.stack}
          selected={draft.stack}
          onChange={(stack) => patch({ stack })}
        />
        <MultiSelect
          label="Location type"
          options={options.locationTypes}
          selected={draft.locationTypes}
          onChange={(locationTypes) => patch({ locationTypes })}
        />
        <MultiSelect
          label="Region eligibility"
          options={options.regionEligibility}
          selected={draft.regionEligibility}
          onChange={(regionEligibility) => patch({ regionEligibility })}
        />
        <TagInput
          label="Exclude terms (titles matching these are dropped)"
          tags={draft.excludeTerms}
          onChange={(excludeTerms) => patch({ excludeTerms })}
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="freshnessDays"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Freshness (days)
            </label>
            <input
              id="freshnessDays"
              type="number"
              min={1}
              max={365}
              value={draft.freshnessDays ?? ''}
              onChange={(e) =>
                patch({
                  freshnessDays:
                    e.target.value === '' ? null : Number(e.target.value),
                })
              }
              placeholder="Any"
              className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="minFitScore"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Min fit score
            </label>
            <input
              id="minFitScore"
              type="number"
              min={0}
              max={100}
              value={draft.minFitScore ?? ''}
              onChange={(e) =>
                patch({
                  minFitScore:
                    e.target.value === '' ? null : Number(e.target.value),
                })
              }
              placeholder="Default"
              className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>
      </div>

      <button
        onClick={() => save(draft)}
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
      >
        <Save size={16} />
        {isPending ? 'Saving…' : 'Save profile'}
      </button>
    </div>
  );
}
