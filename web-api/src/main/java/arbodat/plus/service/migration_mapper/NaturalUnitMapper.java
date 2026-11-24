package arbodat.plus.service.migration_mapper;

import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
public class NaturalUnitMapper {

    private final Map<String, String> naturalUnitMap;

    public NaturalUnitMapper() {
        naturalUnitMap = new HashMap<>();

    // Gäuplatten im Neckar- und Tauberland
        naturalUnitMap.put("12----", "http://uri.gbv.de/terminology/arbodat_natural_unit/353c6e13-ecef-4dc1-99fc-3f032b455304");

        // Neckarbecken
        naturalUnitMap.put("123", "http://uri.gbv.de/terminology/arbodat_natural_unit/124dbfed-4ed5-4e8c-a823-032daac105d8");

        // Kraichgau
        naturalUnitMap.put("125", "http://uri.gbv.de/terminology/arbodat_natural_unit/594e4045-6ea6-4674-9a86-253c85fc4f58");

        // Kocher-Jagst-Ebenen
        naturalUnitMap.put("126", "http://uri.gbv.de/terminology/arbodat_natural_unit/8c6bdb31-53c9-402a-9dcf-5793f27f8283");

        // Hohenloher und Haller Ebene
        naturalUnitMap.put("127", "http://uri.gbv.de/terminology/arbodat_natural_unit/518c7070-0d00-46e1-a6c2-640a67f88bcd");

        // Bauland
        naturalUnitMap.put("128", "http://uri.gbv.de/terminology/arbodat_natural_unit/3edb33ac-efa8-4b58-bf00-74e01d72198c");

    // Mainfränkische Platten
        naturalUnitMap.put("13----", "http://uri.gbv.de/terminology/arbodat_natural_unit/740fe949-afea-4a0e-94f0-876ed0c479a9");

        // Ochsenfurter- und Gollachgau
        naturalUnitMap.put("130", "http://uri.gbv.de/terminology/arbodat_natural_unit/8e745c41-5db7-4191-a050-bf34eeacb34e");

        // Gäuplatten im Maindreieck
        naturalUnitMap.put("134", "http://uri.gbv.de/terminology/arbodat_natural_unit/6ab80144-e44b-483b-85fd-20e8b70ec580");

        // Wern-Lauer-Platte
        naturalUnitMap.put("135", "http://uri.gbv.de/terminology/arbodat_natural_unit/d3af144a-9d62-4ea5-b6a4-29fa965910a9");

        // Schweinfurter Becken
        naturalUnitMap.put("136", "http://uri.gbv.de/terminology/arbodat_natural_unit/f8c6e1a4-490b-43fd-aa91-26c68f146f7e");

        // Steigerwaldvorland
        naturalUnitMap.put("137", "http://uri.gbv.de/terminology/arbodat_natural_unit/881c72b9-517a-43bf-80eb-f41705fd187b");

        // Grabfeld
        naturalUnitMap.put("138a", "http://uri.gbv.de/terminology/arbodat_natural_unit/e718cb28-a6de-4b5a-988d-cbd0d5efd474");

        // Werra Gäuplatten
        naturalUnitMap.put("138b", "http://uri.gbv.de/terminology/arbodat_natural_unit/d63f9f66-277c-4765-a538-80d8d6392c2e");

        // Hesselbacher Waldland
        naturalUnitMap.put("139", "http://uri.gbv.de/terminology/arbodat_natural_unit/84257ba6-f6cd-4ad0-97c0-daa8694d788c");

    // Odenwald, Spessart und Südrhön
        naturalUnitMap.put("14----", "http://uri.gbv.de/terminology/arbodat_natural_unit/b1e8d3fa-71b9-47fb-9b4d-3cef8c3e2757");

        // Südrhön
        naturalUnitMap.put("140", "http://uri.gbv.de/terminology/arbodat_natural_unit/68292608-74b2-4eec-b22a-0e7dda829cd1");

        // Sandsteinspessart
        naturalUnitMap.put("141", "http://uri.gbv.de/terminology/arbodat_natural_unit/ef6eea50-3f94-4d9a-95a3-661267a91534");

        // Vorderer Spessart
        naturalUnitMap.put("142", "http://uri.gbv.de/terminology/arbodat_natural_unit/f95ac75e-46b9-427c-8ebe-674473c2ec3a");

        // Büdinger Wald
        naturalUnitMap.put("143", "http://uri.gbv.de/terminology/arbodat_natural_unit/23ee9fe6-4236-449b-be3d-c5b30f61f020");

        // Sandsteinodenwald
        naturalUnitMap.put("144", "http://uri.gbv.de/terminology/arbodat_natural_unit/03ebec15-d218-4937-b3e2-cd9bef011e30");

        // Vorderer Odenwald
        naturalUnitMap.put("145", "http://uri.gbv.de/terminology/arbodat_natural_unit/01ff7f93-c64d-4bff-b6c9-94e97d1e7750");

    // Haardtgebirge
        naturalUnitMap.put("17----", "http://uri.gbv.de/terminology/arbodat_natural_unit/f57c48b5-3dc8-4e3e-b784-adf621470b5f");

        // Haardt
        naturalUnitMap.put("170", "http://uri.gbv.de/terminology/arbodat_natural_unit/b924538e-5086-46a6-a20a-98ac0b806214");

        // Dahner Felsenland
        naturalUnitMap.put("171", "http://uri.gbv.de/terminology/arbodat_natural_unit/94dcbb31-b911-4c5b-ad38-45368103806d");

    // Pfälzisch-Saarländisches Muschelkalkgebiet
        naturalUnitMap.put("18----", "http://uri.gbv.de/terminology/arbodat_natural_unit/3007fc93-6e31-404e-a97d-26dd32acea05");

        // Zweibrücker Westrich
        naturalUnitMap.put("180", "http://uri.gbv.de/terminology/arbodat_natural_unit/ef62af90-afbd-4b6a-8804-b101f1ee18d9");

    // Saar-Nahe-Bergland
        naturalUnitMap.put("19----", "http://uri.gbv.de/terminology/arbodat_natural_unit/f59ea153-3067-4cf2-8d65-ad76bd6626f0");

        // Kaiserslauterer Senke
        naturalUnitMap.put("192", "http://uri.gbv.de/terminology/arbodat_natural_unit/e8b9c5fb-b012-42e6-b076-f1d87fe40e59");

        // Glan-Alsenz-Berg- und Hügelland
        naturalUnitMap.put("193", "http://uri.gbv.de/terminology/arbodat_natural_unit/9e029bdd-b497-4980-8e59-e0880214b955");

        // Soonwaldvorstufe
        naturalUnitMap.put("195", "http://uri.gbv.de/terminology/arbodat_natural_unit/9bf9a811-716c-477f-abc8-057fc7515ffb");

    // Nördliches Oberrheintiefland
        naturalUnitMap.put("22----", "http://uri.gbv.de/terminology/arbodat_natural_unit/ba560bb1-322d-43ca-97f0-254128043f6c");

        // Haardtrand
        naturalUnitMap.put("220", "http://uri.gbv.de/terminology/arbodat_natural_unit/d9c7a960-a014-4298-a461-1a84e2e57f09");

        // Vorderpfälzer Tiefland
        naturalUnitMap.put("221", "http://uri.gbv.de/terminology/arbodat_natural_unit/9a5dd63d-4131-4083-b875-df74b78ed5ba");

        // Nördliche Oberrheinniederung
        naturalUnitMap.put("222", "http://uri.gbv.de/terminology/arbodat_natural_unit/d89fe979-f27d-4fc9-afd4-ad620f888901");

        // Haardtebenen
        naturalUnitMap.put("223", "http://uri.gbv.de/terminology/arbodat_natural_unit/a7e5ae0d-0abe-4202-a1a8-d76f14becb1d");

        // Neckar-Rhein-Ebene
        naturalUnitMap.put("224", "http://uri.gbv.de/terminology/arbodat_natural_unit/a7f42d5d-0c40-4d83-8df4-04a72abf4de2");

        // Hessische Rheinebene
        naturalUnitMap.put("225", "http://uri.gbv.de/terminology/arbodat_natural_unit/12ec0098-2640-4941-8bec-5e4b9aa0a964");

        // Bergstraße
        naturalUnitMap.put("226", "http://uri.gbv.de/terminology/arbodat_natural_unit/480fc373-5ea0-4a66-9f8c-5ec445de5615");

        // Alzeyer Hügelland
        naturalUnitMap.put("227", "http://uri.gbv.de/terminology/arbodat_natural_unit/a2db4895-9f97-4842-a53d-6ed3237f0d71");

        // Unteres Naheland
        naturalUnitMap.put("228", "http://uri.gbv.de/terminology/arbodat_natural_unit/0e51d534-a10f-461f-8f8e-93d0d75299f0");

    // Rhein-Main-Tiefland
        naturalUnitMap.put("23----", "http://uri.gbv.de/terminology/arbodat_natural_unit/cf7fda66-e61d-4b44-a176-2f687af3a0ad");

        // Messeler Hügelland
        naturalUnitMap.put("230", "http://uri.gbv.de/terminology/arbodat_natural_unit/331cd0cd-afff-4f65-9c18-cf3412bec55a");

        // Reinheimer Hügelland
        naturalUnitMap.put("231", "http://uri.gbv.de/terminology/arbodat_natural_unit/15e632ff-7194-4580-9cc1-9b4187dea5b2");

        // Untermainebene
        naturalUnitMap.put("232", "http://uri.gbv.de/terminology/arbodat_natural_unit/318ca063-b145-4bbe-b904-9d98a6d7f25a");

        // Ronneburger Hügelland
        naturalUnitMap.put("233", "http://uri.gbv.de/terminology/arbodat_natural_unit/1fc10c13-8ca9-4022-afa1-fe4ac906726d");

        // Wetterau
        naturalUnitMap.put("234", "http://uri.gbv.de/terminology/arbodat_natural_unit/ac4d78ef-959e-4383-bf0a-02255b84847a");

        // Main-Taunus-Vorland
        naturalUnitMap.put("235", "http://uri.gbv.de/terminology/arbodat_natural_unit/ef3e16cd-a1cb-4e2f-9517-dcafc8420e1c");

        // Rheingau
        naturalUnitMap.put("236", "http://uri.gbv.de/terminology/arbodat_natural_unit/3a132f03-d613-4a71-8db9-21616c1f990c");

        // Ingelheimer Rheinebene
        naturalUnitMap.put("237", "http://uri.gbv.de/terminology/arbodat_natural_unit/6ce19a38-8cff-4a2a-82dd-7c79296ab42b");

    // Hunsrück
        naturalUnitMap.put("24----", "http://uri.gbv.de/terminology/arbodat_natural_unit/f313edfd-ba50-4fea-bda8-3015a0a49b25");

        // Soonwald
        naturalUnitMap.put("240", "http://uri.gbv.de/terminology/arbodat_natural_unit/24464887-b26f-43fc-bbdd-bb844aeac95e");

        // Simmerner Mulde
        naturalUnitMap.put("241", "http://uri.gbv.de/terminology/arbodat_natural_unit/3639acc6-966e-425c-85e5-aa18efbad0cc");

        // Hunsrückhochfläche
        naturalUnitMap.put("243", "http://uri.gbv.de/terminology/arbodat_natural_unit/f9426086-3559-4a4f-a0b6-cc32dbf225d8");

        // Rheinhunsrück
        naturalUnitMap.put("244", "http://uri.gbv.de/terminology/arbodat_natural_unit/ee42114c-444a-45ab-bbb9-5d18a1705239");

        // Moselhunsrück
        naturalUnitMap.put("245", "http://uri.gbv.de/terminology/arbodat_natural_unit/675e3131-1c34-4ba8-b621-b03b36b65318");

    // Mittelrheingebiet
        naturalUnitMap.put("29----", "http://uri.gbv.de/terminology/arbodat_natural_unit/7cb142cc-c3a6-46d5-9264-51511637b34c");

        // Oberes Mittelrheintal
        naturalUnitMap.put("290", "http://uri.gbv.de/terminology/arbodat_natural_unit/fcb92da7-579b-402e-afa2-ae002ecdb766");

        // Mittelrheinisches Becken
        naturalUnitMap.put("291", "http://uri.gbv.de/terminology/arbodat_natural_unit/1939d8ec-82b7-46c0-8d85-59f57f807b6c");

    // Taunus
        naturalUnitMap.put("30----", "http://uri.gbv.de/terminology/arbodat_natural_unit/7360858b-0ed1-45c9-b05e-fdd63e52c94e");

        // Vortaunus
        naturalUnitMap.put("300", "http://uri.gbv.de/terminology/arbodat_natural_unit/13a23555-2ea9-41cb-8dbf-e31f630c8e9e");

        // Hoher Taunus
        naturalUnitMap.put("301", "http://uri.gbv.de/terminology/arbodat_natural_unit/8ba9d7b6-ef35-438b-b988-7875faf2d987");

        // Östlicher Hintertaunus
        naturalUnitMap.put("302", "http://uri.gbv.de/terminology/arbodat_natural_unit/fe349fea-e7d9-408e-a387-561c039880e2");

        // Idsteiner Senke
        naturalUnitMap.put("303", "http://uri.gbv.de/terminology/arbodat_natural_unit/112bce97-a733-478b-be62-336138094703");

        // Westlicher Hintertaunus
        naturalUnitMap.put("304", "http://uri.gbv.de/terminology/arbodat_natural_unit/e83075f1-9744-4927-8f8c-e4dfa419a370");

    // Lahntal
        naturalUnitMap.put("31----", "http://uri.gbv.de/terminology/arbodat_natural_unit/07f043d2-f446-499d-a659-e77974d46ce6");

        // Unteres Lahntal
        naturalUnitMap.put("310", "http://uri.gbv.de/terminology/arbodat_natural_unit/d3f4eabf-d802-4eae-92e9-69203713b43a");

        // Limburger Becken
        naturalUnitMap.put("311", "http://uri.gbv.de/terminology/arbodat_natural_unit/d69027c4-b078-4adc-9cab-20c8021744dd");

        // Weilburger Lahntal
        naturalUnitMap.put("312", "http://uri.gbv.de/terminology/arbodat_natural_unit/1358ae5c-5108-4b36-aecb-ff5ceecd77e2");

    // Westerwald
        naturalUnitMap.put("32----", "http://uri.gbv.de/terminology/arbodat_natural_unit/0abd2425-fe71-4a63-8e5c-00418b99d367");

        // Lahn-Dill-Bergland
        naturalUnitMap.put("320", "http://uri.gbv.de/terminology/arbodat_natural_unit/b524e073-6b61-4e29-9b8c-e39303d24d03");

        // Dilltal
        naturalUnitMap.put("321", "http://uri.gbv.de/terminology/arbodat_natural_unit/046ad4a7-7ea3-412a-bb35-e10dff400ba4");

        // Hoher Westerwald
        naturalUnitMap.put("322", "http://uri.gbv.de/terminology/arbodat_natural_unit/3d91eac7-35b0-4dd6-9075-3be7f2126f8a");

        // Oberwesterwald
        naturalUnitMap.put("323", "http://uri.gbv.de/terminology/arbodat_natural_unit/b1ec3b09-63f6-4512-bfb4-6c0b1b19a45c");

        // Niederwesterwald
        naturalUnitMap.put("324", "http://uri.gbv.de/terminology/arbodat_natural_unit/ee35d14d-aaf8-48c6-a56e-d82906384cb6");

    // Bergisch-Sauerländisches Gebirge
        naturalUnitMap.put("33----", "http://uri.gbv.de/terminology/arbodat_natural_unit/836ee92f-29a0-4878-8a54-ef448d4f2f4b");

        // Mittelsieg-Bergland
        naturalUnitMap.put("330", "http://uri.gbv.de/terminology/arbodat_natural_unit/d2bbce92-a343-4d43-adcd-79e3199a49f8");

        // Siegerland
        naturalUnitMap.put("331", "http://uri.gbv.de/terminology/arbodat_natural_unit/be7a7555-6c2b-4279-a8c2-ba972032308a");

        // Ostsauerländer Gebirgsrand
        naturalUnitMap.put("332", "http://uri.gbv.de/terminology/arbodat_natural_unit/b16b6baa-42f7-46d3-887a-37fbbdaf446d");

        // Hochsauerland (Rothaargebirge)
        naturalUnitMap.put("333", "http://uri.gbv.de/terminology/arbodat_natural_unit/443d59c8-1beb-44af-aaa6-5ac61eacbabb");

        // Nordsauerländer Oberland
        naturalUnitMap.put("334", "http://uri.gbv.de/terminology/arbodat_natural_unit/03852558-f6b5-4e4c-aecc-359ed0b1adf0");

        // Innersauerländer Senken
        naturalUnitMap.put("335", "http://uri.gbv.de/terminology/arbodat_natural_unit/5f5f9e7c-be34-408f-a9af-67de2e8743f4");

        // Westsauerländer Oberland
        naturalUnitMap.put("336", "http://uri.gbv.de/terminology/arbodat_natural_unit/55b5b0e5-6b9c-4f8f-bab1-4e18c1cbec40");

        // Bergland der oberen Agger und Wiehl
        naturalUnitMap.put("339", "http://uri.gbv.de/terminology/arbodat_natural_unit/aa6837a4-9a31-4047-a904-2804cb26d5f3");

    // Westhessisches Bergland
        naturalUnitMap.put("34----", "http://uri.gbv.de/terminology/arbodat_natural_unit/3d9260bc-8826-44e5-ad5c-e6b8ba0c74ce");

        // Waldecker Tafelland
        naturalUnitMap.put("340", "http://uri.gbv.de/terminology/arbodat_natural_unit/9530f9a8-0401-4758-9463-69e5c5805452");

        // Waldecker Gebirgsvorland
        naturalUnitMap.put("340a", "http://uri.gbv.de/terminology/arbodat_natural_unit/1065e7c2-b86f-45d2-886b-497dd2156bac");

        // Waldecker Wald
        naturalUnitMap.put("340b", "http://uri.gbv.de/terminology/arbodat_natural_unit/2c69faea-5227-4fa7-863e-2189d786990e");

        // Ostwaldecker Randsenken
        naturalUnitMap.put("341", "http://uri.gbv.de/terminology/arbodat_natural_unit/a8936f63-7d0a-4915-bb1d-90f5192db2fd");

        // Habichtswälder Bergland
        naturalUnitMap.put("342", "http://uri.gbv.de/terminology/arbodat_natural_unit/845dc294-9f5f-4123-aeb0-f4609a8bc925");

        // Westhessische Senke
        naturalUnitMap.put("343", "http://uri.gbv.de/terminology/arbodat_natural_unit/779e991a-5441-44b4-9173-4e5a5a44d1b0");

        // Kellerwald
        naturalUnitMap.put("344", "http://uri.gbv.de/terminology/arbodat_natural_unit/ae8638e8-80f0-4de2-8308-8b4a3e7746b4");

        // Burgwald
        naturalUnitMap.put("345", "http://uri.gbv.de/terminology/arbodat_natural_unit/b86bb4ec-a0c8-4969-80f1-61ee8a0c0d57");

        // Oberhessische Schwelle
        naturalUnitMap.put("346", "http://uri.gbv.de/terminology/arbodat_natural_unit/255d51fa-8655-4a38-a93c-25522452e53e");

        // Amöneburger Becken
        naturalUnitMap.put("347", "http://uri.gbv.de/terminology/arbodat_natural_unit/58003626-2aa8-4f29-a66b-7b941f479b88");

        // Marburg-Gießener Lahntal
        naturalUnitMap.put("348", "http://uri.gbv.de/terminology/arbodat_natural_unit/16f3ad0d-3f33-487c-9d96-78af469d8f83");

        // Vorderer Vogelsberg
        naturalUnitMap.put("349", "http://uri.gbv.de/terminology/arbodat_natural_unit/e7846410-fd65-4a86-84ed-3873b57b5a96");

    // Osthessisches Bergland
        naturalUnitMap.put("35----", "http://uri.gbv.de/terminology/arbodat_natural_unit/278f4189-5bb2-4d1d-ab8c-17ba9801cf2a");

        // Unterer Vogelsberg
        naturalUnitMap.put("350", "http://uri.gbv.de/terminology/arbodat_natural_unit/e0b2b69b-1fe9-42d3-8447-70dd6bdb3fa5");

        // Hoher Vogelsberg (mit Oberwald)
        naturalUnitMap.put("351", "http://uri.gbv.de/terminology/arbodat_natural_unit/65379741-32a3-43be-bd4b-53640d810613");

        // Fuldaer Senke
        naturalUnitMap.put("352", "http://uri.gbv.de/terminology/arbodat_natural_unit/9b10b07e-96a8-4fb2-ae22-56268e2c4875");

        // Vorder- und Kuppenrhön (mit Landrücken)
        naturalUnitMap.put("353", "http://uri.gbv.de/terminology/arbodat_natural_unit/0422e3bb-056d-448e-8c23-8185f32ba5c9");

        // Lange Rhön
        naturalUnitMap.put("354", "http://uri.gbv.de/terminology/arbodat_natural_unit/5d93d147-e918-4adf-95a6-2c40cdb7f8cf");

        // Fulda-Haune-Tafelland
        naturalUnitMap.put("355", "http://uri.gbv.de/terminology/arbodat_natural_unit/2aabfc7f-b90e-4986-a060-48cb9d9d628b");

        // Knüll und Homberger Becken
        naturalUnitMap.put("356", "http://uri.gbv.de/terminology/arbodat_natural_unit/70130001-77b6-4ab8-927a-8b14c6345aec");

        // Fulda-Werra-Bergland
        naturalUnitMap.put("357", "http://uri.gbv.de/terminology/arbodat_natural_unit/ad8c91c2-fa7c-42c8-baab-d22435db3d25");

        // Unteres Werratal
        naturalUnitMap.put("358", "http://uri.gbv.de/terminology/arbodat_natural_unit/a572747f-e4f6-447a-8943-f0a6ed07caf3");

        // Salzunger Werrabergland
        naturalUnitMap.put("359", "http://uri.gbv.de/terminology/arbodat_natural_unit/c69bf6ef-b2e5-4b4a-8252-d54c9d3edd25");

    // Oberes Weserbergland
        naturalUnitMap.put("36----", "http://uri.gbv.de/terminology/arbodat_natural_unit/a77a66a5-bbc8-4bc6-b2e6-83d88d33845c");

        // Warburger Börde
        naturalUnitMap.put("360", "http://uri.gbv.de/terminology/arbodat_natural_unit/325b6e03-a03d-475f-a4a3-1971a5da4118");

        // Oberwälder Land
        naturalUnitMap.put("361", "http://uri.gbv.de/terminology/arbodat_natural_unit/ee1b301e-85d3-48e3-963b-4434e51e4238");

        // Paderborner Hochfläche
        naturalUnitMap.put("362", "http://uri.gbv.de/terminology/arbodat_natural_unit/4700b27e-4a47-472a-920c-676f1a3bc353");

        // Egge
        naturalUnitMap.put("363", "http://uri.gbv.de/terminology/arbodat_natural_unit/c95c0c86-8efe-4bfe-a961-e2394fc2b39e");

        // Holzmindener Wesertal
        naturalUnitMap.put("367", "http://uri.gbv.de/terminology/arbodat_natural_unit/f655ef33-86e9-4106-a7de-bbf4656c8bb3");

    // Weser-Leine-Bergland
        naturalUnitMap.put("37----", "http://uri.gbv.de/terminology/arbodat_natural_unit/1a8d22bc-310c-4a7b-83b2-cb14dd80fcc6");

        // Solling, Bramwald und Reinhardswald
        naturalUnitMap.put("370", "http://uri.gbv.de/terminology/arbodat_natural_unit/7fbe4106-6b94-4175-80eb-2219b0b03bf9");

        // Sollingvorland
        naturalUnitMap.put("371", "http://uri.gbv.de/terminology/arbodat_natural_unit/94a2b1e5-d76c-4b18-b84d-9ab6792c4d0c");

        // Leine-Ilme-Senke
        naturalUnitMap.put("372", "http://uri.gbv.de/terminology/arbodat_natural_unit/011d541a-72a7-4282-9032-1da22f673597");

        // Göttingen-Northeimer Wald
        naturalUnitMap.put("373", "http://uri.gbv.de/terminology/arbodat_natural_unit/a4b2a249-e4c4-46bd-9ba6-63beba6b4c4e");

        // Eichsfelder Becken (Goldene Mark)
        naturalUnitMap.put("374", "http://uri.gbv.de/terminology/arbodat_natural_unit/2173b73e-0874-4049-b68a-c70b85be86ed");

        // Unteres Eichsfeld
        naturalUnitMap.put("375", "http://uri.gbv.de/terminology/arbodat_natural_unit/2fe0dbba-856e-4693-9ff3-7733b93a5c27");

        // Südwestliches Harzvorland
        naturalUnitMap.put("376", "http://uri.gbv.de/terminology/arbodat_natural_unit/f4a6aca4-f50d-427c-afe5-8f31658011d9");

    // Thüringer Becken und Randplatten
        naturalUnitMap.put("48----", "http://uri.gbv.de/terminology/arbodat_natural_unit/5a1c0aca-76e7-428f-b20a-e97c09b31e0b");

        // Ringgau, Hainich, Obereichsfeld und Dün-Hainleite
        naturalUnitMap.put("483", "http://uri.gbv.de/terminology/arbodat_natural_unit/339abe0f-4df8-4356-9271-c1d5cc95817f");

    // Westfälische Tieflandsbucht
        naturalUnitMap.put("54----", "http://uri.gbv.de/terminology/arbodat_natural_unit/76134a4d-19cf-4737-9c25-a664400e807a");

        // Ostmünsterland
        naturalUnitMap.put("540", "http://uri.gbv.de/terminology/arbodat_natural_unit/2deec969-0e58-44c5-a3af-9c51b85ad1b2");

        // Hellwegbörden
        naturalUnitMap.put("542", "http://uri.gbv.de/terminology/arbodat_natural_unit/0889c7b1-1e58-4417-878b-9f1913a7c2c2");

        // Donaumoos
        naturalUnitMap.put("63", "http://uri.gbv.de/terminology/arbodat_natural_unit/8ddf71d6-0236-456f-958a-9c69c79e9bcb");

    // Österreich
        naturalUnitMap.put("80----", "http://uri.gbv.de/terminology/arbodat_natural_unit/be1e2991-fd8c-4d9f-be2c-bbec04f48500");

        // Wien
        naturalUnitMap.put("801", "http://uri.gbv.de/terminology/arbodat_natural_unit/63e91c5e-7709-4dec-afa9-446f86717b56");

    // Schweiz -> Becken und Talböden zwischen den Hauptgruppen der Alpen
        naturalUnitMap.put("90----", "http://uri.gbv.de/terminology/arbodat_natural_unit/21b7a32d-c08e-458f-8bd6-caf68cb2e3bd");

        // Basel
        naturalUnitMap.put("901", "http://uri.gbv.de/terminology/arbodat_natural_unit/e47d036b-538c-4567-a1de-9edf3631e648");

    // ArboDat+_naturalUnit
        // unknown
        naturalUnitMap.put("999", "ArboDat+_naturalUnit_unknown");
        // not chosen
        naturalUnitMap.put("-99", "ArboDat+_naturalUnit_notChosen");
        naturalUnitMap.put(null, "ArboDat+_naturalUnit_notChosen");
    }

    public String getUri(String key) {
        return naturalUnitMap.get(key);
    }
}
