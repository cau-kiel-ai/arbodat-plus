package arbodat.plus.service;

import arbodat.plus.dto_migration.BulkItemStatus;
import arbodat.plus.dto_migration.BulkUserItem;
import arbodat.plus.model.Sample;
import arbodat.plus.model.Site;
import arbodat.plus.model.User;
import arbodat.plus.repository.SampleRepository;
import arbodat.plus.repository.SiteRepository;
import arbodat.plus.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

// Sets the users of site roles and samples of the migration (team accordion) in bulk:
// sites, samples and users are loaded once per request instead of once per row.
@Service
public class TeamMigrationService {

    @Autowired
    SiteRepository siteRepository;

    @Autowired
    SampleRepository sampleRepository;

    @Autowired
    UserRepository userRepository;

    /**
     * Sets the users of the given rows (they replace the users set so far). Each item gets its own status:
     * "updated", or "error" (unknown site / sample / user, no user, invalid role or type).
     */
    @Transactional
    public List<BulkItemStatus> assignAll(List<BulkUserItem> items) {

        Map<UUID, Site> sites = byId(items, "site", siteRepository::findAllById, Site::getId);
        Map<UUID, Sample> samples = byId(items, "sample", sampleRepository::findAllById, Sample::getId);
        Set<UUID> userIds = items.stream()
                .map(BulkUserItem::getUserIds)
                .filter(Objects::nonNull)
                .flatMap(List::stream)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, User> users = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        List<BulkItemStatus> statuses = new ArrayList<>();
        for (BulkUserItem item : items) {
            String clientId = item.getClientId();

            List<UUID> ids = item.getUserIds() != null ? item.getUserIds() : List.of();
            if (ids.isEmpty()) {
                statuses.add(BulkItemStatus.error(clientId, "no user"));
                continue;
            }
            Optional<UUID> unknown = ids.stream().filter(id -> !users.containsKey(id)).findFirst();
            if (unknown.isPresent()) {
                statuses.add(BulkItemStatus.error(clientId, "invalid user id: " + unknown.get()));
                continue;
            }
            Set<User> team = ids.stream().map(users::get).collect(Collectors.toCollection(HashSet::new));

            if ("site".equals(item.getType())) {
                Site site = item.getId() != null ? sites.get(item.getId()) : null;
                if (site == null) {
                    statuses.add(BulkItemStatus.error(clientId, "invalid site id"));
                    continue;
                }
                switch (String.valueOf(item.getUserRole())) {
                    case "siteDirector"  -> site.setSiteDirectors(team);
                    case "archaeologist" -> site.setArchaeologists(team);
                    case "botanist"      -> site.setBotanists(team);
                    default -> {
                        statuses.add(BulkItemStatus.error(clientId, "invalid role: " + item.getUserRole()));
                        continue;
                    }
                }
            } else if ("sample".equals(item.getType())) {
                Sample sample = item.getId() != null ? samples.get(item.getId()) : null;
                if (sample == null) {
                    statuses.add(BulkItemStatus.error(clientId, "invalid sample id"));
                    continue;
                }
                sample.setBotanicalDeterminationBy(team);
            } else {
                statuses.add(BulkItemStatus.error(clientId, "invalid type: " + item.getType()));
                continue;
            }
            statuses.add(BulkItemStatus.updated(clientId));
        }
        // The sites and samples are saved with the transaction (managed entities)
        return statuses;
    }

    private static <T> Map<UUID, T> byId(List<BulkUserItem> items, String type,
                                         Function<Set<UUID>, List<T>> findAllById, Function<T, UUID> getId) {
        Set<UUID> ids = items.stream()
                .filter(item -> type.equals(item.getType()) && item.getId() != null)
                .map(BulkUserItem::getId)
                .collect(Collectors.toSet());
        return findAllById.apply(ids).stream().collect(Collectors.toMap(getId, Function.identity()));
    }
}
