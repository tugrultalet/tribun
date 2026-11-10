import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MyPick } from '../game/stats';
import { PicksList, SummaryCard } from '../game/PicksView';
import type { RootParams } from '../nav';
import { useRpc } from '../social';
import { useStore } from '../store';
import { Empty, Loader } from '../ui';
import { Screen } from './Screen';

type Profile = { name?: string; picks?: MyPick[]; error?: string };

// Başka bir üyenin profili: yalnızca ortak grup varsa görünür (sunucu denetler); başlamamış maçların tahminleri gelmez.
export default function Member({ route }: NativeStackScreenProps<RootParams, 'Member'>) {
  const secret = useStore().me?.secret;
  const state = useRpc<Profile>('member_profile', secret ? { p_secret: secret, p_profile: route.params.id } : null);
  return (
    <Screen title={state.data?.name ?? route.params.name} onRefresh={state.reload}>
      <Loader state={state}>
        {(d) => d.error ? <Empty>{d.error}</Empty> : (
          <>
            <SummaryCard profile={route.params.id} picks={Array.isArray(d.picks) ? d.picks : []} />
            <PicksList title="Tahminleri" profile={route.params.id} picks={Array.isArray(d.picks) ? d.picks : []} />
          </>
        )}
      </Loader>
    </Screen>
  );
}
