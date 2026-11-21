package arbodat.plus.service;

import arbodat.plus.model.AbsoluteDating;
import arbodat.plus.model.C14Laboratory;
import arbodat.plus.model.Feature;
import arbodat.plus.model.Sample;

/**
 * A laboratory number identifies one dating: no other dating may have the same laboratory and number.
 * Thrown by AbsoluteDatingController (answered with 409); the bulk update of the migration
 * (LabAndNumberMigrationService) uses the message for the row instead.
 */
public class LaboratoryNumberTakenException extends RuntimeException {

    public LaboratoryNumberTakenException(String kind, String laboratory, String number, AbsoluteDating owner) {
        super("The " + kind + " dating number " + number + " of " + laboratory + " is already used"
                + (owner == null ? "" : " by absolute dating " + describe(owner)) + ". A laboratory number can belong to one dating only.");
    }

    private static String describe(AbsoluteDating owner) {
        StringBuilder path = new StringBuilder();
        Sample sample = owner.getSample();
        if (sample != null) {
            Feature feature = sample.getFeature();
            if (feature != null && feature.getSite() != null) path.append(feature.getSite().getLabel()).append(" › ");
            if (feature != null) path.append(feature.getLabel()).append(" › ");
            path.append(sample.getLabel()).append(" › ");
        }
        return path.append(owner.getSubSample() == null ? "(no sub-sample)" : owner.getSubSample()).toString();
    }

    public static String c14LaboratoryName(C14Laboratory laboratory) {
        if (laboratory.getLabel() != null && !laboratory.getLabel().isBlank()) return laboratory.getLabel();
        if (laboratory.getNotation() != null && !laboratory.getNotation().isBlank()) return laboratory.getNotation();
        return laboratory.getId();
    }

    public static String laboratoryName(String label) {
        return label == null || label.isBlank() ? "this laboratory" : label;
    }
}
